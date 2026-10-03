import {notifications} from '@mantine/notifications'
import {keepPreviousData, useMutation, useQuery} from '@tanstack/react-query'
import {useEffect, useSyncExternalStore} from 'react'
import {getJob, isTerminal, JOB_STATUS, listJobs, rejectedJobOf} from '../../api/configuration/jobs.js'
import {TooManyRequestsError} from '../../api/errors.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {finishedText, retryText} from './jobTexts.js'
import {sessionJobs} from './sessionJobs.js'

/** Cada cuánto se vuelve a preguntar mientras hay algo en curso: el POLL_PERIOD del backoffice. */
export const POLL_INTERVAL_MS = 2000

const FINISHED_OK_MS = 5000
const FINISHED_WRONG_MS = 10000

export function jobsKey(...parts) {
    return ['configuration', 'jobs', ...parts]
}

/** Los trabajos de esta pestaña, para pintar sus etiquetas y saber si queda alguno en curso. */
export function useSessionJobs() {
    return useSyncExternalStore(sessionJobs.subscribe, sessionJobs.snapshot)
}

/**
 * Una vuelta de seguimiento, la poll del backoffice: la página que se ve y, de los trabajos de esta
 * pestaña que siguen en curso y no están en ella, el detalle de cada uno por su familia. Un detalle
 * que falla no estropea la vuelta: se vuelve a pedir en la siguiente.
 */
async function followJobs(query, signal) {
    const page = await listJobs(query, {signal})
    const onPage = new Set(page.content.map((job) => job.id))
    const offPage = sessionJobs.active().filter((entry) => !onPage.has(entry.job.id))
    const followed = await Promise.all(offPage.map((entry) => getJob(entry.job, {signal}).catch(() => null)))
    return {...page, followed: followed.filter(Boolean)}
}

/**
 * La lista del servicio, paginada y filtrada allí, que se vuelve a pedir cada dos segundos mientras
 * haya algo en curso: en la página o lanzado desde esta pestaña. Con todo terminado, o con la pestaña
 * oculta, no se pregunta nada; fuera de la pantalla, tampoco, porque la consulta se desmonta.
 *
 * Su fallo no se avisa (un aviso cada dos segundos sería ruido): la pantalla lo enseña fijo encima de
 * la tabla mientras el último intento falle. Lo que llega de cada vuelta pone al día los trabajos de
 * la pestaña, y el que acaba de terminar se avisa, también al volver a la pantalla si terminó
 * mientras tanto.
 */
export function useJobList(query) {
    const tracked = useSessionJobs()
    const following = tracked.some((entry) => !isTerminal(entry.job))
    const list = useQuery({
        queryKey: jobsKey('list', query),
        queryFn: ({signal}) => followJobs(query, signal),
        placeholderData: keepPreviousData,
        // La lista cambia sola: nunca se da por fresca.
        staleTime: 0,
        refetchInterval: (current) => (following || hasRunning(current.state.data) ? POLL_INTERVAL_MS : false),
        refetchIntervalInBackground: false,
        meta: {notifyError: false},
    })

    const data = list.data
    useEffect(() => {
        if (!data) {
            return
        }
        for (const job of [...data.content, ...data.followed]) {
            if (sessionJobs.update(job)) {
                announceFinished(job)
            }
        }
    }, [data])

    return list
}

function hasRunning(data) {
    return Boolean(data?.content.some((job) => !isTerminal(job)))
}

function announceFinished(job) {
    const ok = JOB_STATUS.parse(job.status) === 'COMPLETED'
    notifications.show({
        color: ok ? 'teal' : 'red',
        autoClose: ok ? FINISHED_OK_MS : FINISHED_WRONG_MS,
        message: finishedText(sessionJobs.labelOf(job.id) ?? 'Trabajo', job),
    })
}

/**
 * Lanzar un trabajo: el launch del backoffice. Un 202 se apunta en la pestaña con su etiqueta y la
 * lista vuelve a la primera página, donde ya está. Un 429 también se apunta, porque el servicio guarda
 * el trabajo como rechazado y lo devuelve en el cuerpo: hay que saber que no va a correr y cuándo
 * volver a intentarlo. Cualquier otro fallo se avisa como siempre.
 *
 * Los avisos van aquí y no en la pantalla para que lleguen aunque la persona se haya ido de ella.
 *
 * @param {Function} onLaunched lo que hace la pantalla tras un 202 o un 429 (volver a la primera página)
 * @returns {{launch: (label: string, call: Function, onAccepted?: Function) => void, launching: boolean}}
 */
export function useLaunchJob(onLaunched) {
    const mutation = useMutation({
        mutationFn: ({call}) => call(),
        meta: {notifyError: false},
        onSuccess: (job, {label, onAccepted}) => {
            sessionJobs.track(job, label)
            onLaunched()
            onAccepted?.()
            notifySuccess(`Trabajo encolado: ${label}`)
        },
        onError: (error, {label}) => {
            if (!(error instanceof TooManyRequestsError)) {
                notifyApiError(error)
                return
            }
            const rejected = rejectedJobOf(error)
            if (rejected) {
                sessionJobs.track(rejected, label)
            }
            onLaunched()
            notifyMessages([`Sin hueco para ${label}: el servicio lo ha rechazado.${retryText(error.retryAfterSeconds)}`])
        },
    })
    return {
        launch: (label, call, onAccepted) => mutation.mutate({label, call, onAccepted}),
        launching: mutation.isPending,
    }
}
