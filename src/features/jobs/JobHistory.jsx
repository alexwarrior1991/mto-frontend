import {Alert, Badge, Button, Group, Progress, Select, Stack, Text, Title} from '@mantine/core'
import {IconAlertTriangle, IconDownload, IconRefresh} from '@tabler/icons-react'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {useState} from 'react'
import {downloadJobFile, getJob, isDownloadable, isTerminal, JOB_STATUS, JOB_TYPE, JOBS_PAGE_SIZE} from '../../api/configuration/jobs.js'
import ErrorNotice from '../../ui/errors/ErrorNotice.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import {formatDayTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import JobErrorsModal from './JobErrorsModal.jsx'
import {countText, describeJob, hasErrors, progressOf} from './jobTexts.js'
import {jobsKey, useSessionJobs} from './useJobs.js'

const STATUS_COLORS = Object.freeze({
    PENDING: 'gray',
    RUNNING: 'blue',
    COMPLETED: 'teal',
    COMPLETED_WITH_ERRORS: 'yellow',
    FAILED: 'red',
    REJECTED: 'red',
})

/**
 * El historial: la lista del servicio, de todas las familias y del más reciente al más antiguo, con
 * los filtros de tipo y estado y la página que se pide allí. Los trabajos de esta pestaña llevan la
 * etiqueta con la que se lanzaron; los demás se describen por su tipo.
 *
 * Cada fila ofrece «Descargar» si su fichero está listo y «Errores» si algo falló. La descarga pasa
 * por la API con el token (nunca el downloadUrl del servicio), y los errores por elemento se piden al
 * detalle de su familia, porque la fila no los trae.
 *
 * @param {object} list la consulta de useJobList
 * @param {{page: number, type: string|null, status: string|null}} query
 */
export default function JobHistory({list, query, onQueryChange, references}) {
    const queryClient = useQueryClient()
    const tracked = useSessionJobs()
    const [errors, setErrors] = useState(null)
    const download = useMutation({mutationFn: (job) => downloadJobFile(job)})

    const labels = new Map(tracked.map((entry) => [entry.job.id, entry.label]))
    const labelOf = (job) => labels.get(job.id) ?? describeJob(job, references.trackName)
    const rows = list.data?.content ?? []
    const running = rows.filter((job) => !isTerminal(job)).length

    // La fila no trae los errores por elemento: se piden al detalle de su familia, y se ve lo que llegó
    // en esa llamada. Si falla, el aviso lo da queryClient.js y no se abre ninguna ventana.
    const openErrors = async (job) => {
        const needsDetail = job.failedItems > job.itemErrors.length
        try {
            const detail = needsDetail
                ? await queryClient.fetchQuery({
                    queryKey: jobsKey('detail', job.id),
                    queryFn: ({signal}) => getJob(job, {signal}),
                    staleTime: 0,
                })
                : job
            setErrors({label: labelOf(job), job: detail})
        } catch {
            setErrors(null)
        }
    }

    const columns = [
        {key: 'label', label: 'Trabajo', render: labelOf},
        {key: 'type', label: 'Tipo', render: (job) => JOB_TYPE.label(job.type)},
        {key: 'status', label: 'Estado', render: (job) => <StatusBadge job={job}/>},
        {key: 'createdAt', label: 'Lanzado', render: (job) => formatDayTime(job.createdAt)},
        {key: 'progress', label: 'Progreso', render: (job) => <JobProgress job={job}/>},
        {key: 'successful', label: 'Correctos', render: (job) => job.successfulItems},
        {key: 'failed', label: 'Fallidos', render: (job) => job.failedItems},
    ]

    const actions = (job) => (
        <>
            {isDownloadable(job) && (
                <RowActionButton label={`Descargar ${labelOf(job)}`} tooltip="Descargar" icon={IconDownload}
                                 onClick={() => download.mutate(job)}/>
            )}
            {hasErrors(job) && (
                <RowActionButton label={`Errores de ${labelOf(job)}`} tooltip="Errores" icon={IconAlertTriangle} color="red"
                                 onClick={() => void openErrors(job)}/>
            )}
        </>
    )

    return (
        <Stack>
            <Group justify="space-between" align="flex-end" gap="sm">
                <Group gap="sm" align="flex-end">
                    <Title order={3}>Historial</Title>
                    <Select label="Tipo" placeholder="Todos" clearable w={260} data={JOB_TYPE.selectable()} value={query.type}
                            onChange={(type) => onQueryChange({...query, type, page: 1})}/>
                    <Select label="Estado" placeholder="Todos" clearable w={200} data={JOB_STATUS.selectable()} value={query.status}
                            onChange={(status) => onQueryChange({...query, status, page: 1})}/>
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} onClick={() => void list.refetch()}>
                        Recargar
                    </Button>
                </Group>
                <Text size="sm" c="dimmed" aria-live="polite">
                    {list.data ? countText(list.data.totalElements, running) : ''}
                </Text>
            </Group>
            {list.isError && (
                <Alert color="red" icon={<IconAlertTriangle size={18}/>} title="No se ha podido leer la lista de trabajos">
                    <ErrorNotice message={errorMessage(list.error)} reference={list.error?.reference ?? null}/>
                </Alert>
            )}
            <ServerDataTable ariaLabel="Historial de trabajos" columns={columns} rows={rows} loading={list.isPending}
                             emptyText={list.isError ? 'No se ha podido leer la lista.' : 'Ningún trabajo todavía.'}
                             sort={null} onSortChange={keepServiceOrder} page={query.page} pageSize={JOBS_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(page) => onQueryChange({...query, page})} rowActions={actions} minWidth={900}/>
            {errors && <JobErrorsModal label={errors.label} job={errors.job} onClose={() => setErrors(null)}/>}
        </Stack>
    )
}

// El servicio ordena por cuándo se lanzó, del más reciente al más antiguo, y la lista no ofrece otro
// orden: ninguna columna lo cambia.
function keepServiceOrder() {
}

function StatusBadge({job}) {
    const status = JOB_STATUS.parse(job.status)
    return (
        <Badge variant="light" color={STATUS_COLORS[status] ?? 'gray'} radius="sm" tt="none">
            {JOB_STATUS.label(job.status)}
        </Badge>
    )
}

function JobProgress({job}) {
    const {bar, text} = progressOf(job)
    if (bar === null) {
        return <Text size="sm">{text}</Text>
    }
    return (
        <Group gap="xs" wrap="nowrap">
            <Progress value={bar} w={96} aria-label="Progreso"/>
            <Text size="sm">{text}</Text>
        </Group>
    )
}
