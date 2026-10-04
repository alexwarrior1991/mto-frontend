import {Button, Center, Group, Loader, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {allowsFullOrderUpdate, ORDER_STATUS, ORDER_TYPE, PRIORITY} from '../../api/maintenance/enums.js'
import {isInDoubtLine} from '../../api/maintenance/materials.js'
import {orderPatch, orderRequest} from '../../api/maintenance/orders.js'
import {P} from '../../auth/permissions.js'
import {useSession} from '../../auth/sessionContext.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import StockPicker from '../stock/StockPicker.jsx'
import {maxLength, required, requiredText} from './maintenanceForms.js'
import {saveErrors} from './maintenanceErrors.js'
import {AssetPicker, TeamSelect} from './MaintenancePickers.jsx'
import {useStockNames} from './useMaintenanceNames.js'
import {useOrderMaterials, useSaveOrder, useTeams} from './useMaintenance.js'

const TITLE_LENGTH = 255
const USER_LENGTH = 100

/**
 * El alta o la modificación de una orden (el port de OrderEditorDialog).
 *
 * - El alta elige el activo, buscado en el servidor entre los activos; después ya no cambia.
 * - En borrador y planificada se modifica todo lo demás. Asignada o en curso, solo la descripción, la
 *   prioridad y las notas de cierre, porque es lo que el servicio admite (el resto sería 409
 *   TRN-001).
 * - Viaja solo lo que cambió, con la versión leída. Si otra persona guardó antes, 409 CON-001 con el
 *   diálogo abierto.
 * - El proyecto de almacén se ofrece con stock-read. Si alguna línea de material espera respuesta del
 *   almacén, es de solo lectura: el servicio rechaza cambiarlo (409 MAT-001).
 *
 * @param {object|null} order la orden que se modifica, o null para un alta
 * @param {Function} [onSaved] la orden guardada (el alta abre su ficha)
 */
export default function OrderEditorModal({order, onClose, onSaved = () => {}}) {
    const creating = order === null
    const session = useSession()
    const readsStock = session.has(P.STOCK_READ)
    const full = creating || allowsFullOrderUpdate(order.status)
    const projects = useStockNames('projects', [order?.stockProjectId])
    // Fuera de borrador una reserva o una salida quizá se quedó sin respuesta; si no se pueden leer las líneas, decide el servicio.
    const materials = useOrderMaterials(order?.id, {
        enabled: !creating && full && readsStock && order.status !== 'DRAFT',
        notifyError: false,
    })
    const inDoubt = (materials.data ?? []).some(isInDoubtLine)
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl" title={creating ? 'Nueva orden' : `Modificar ${order.code}`}>
            {projects.ready
                ? <OrderEditorForm order={order} full={full} readsStock={readsStock} project={projects.ref(order?.stockProjectId)}
                                   projectLocked={inDoubt} onClose={onClose} onSaved={onSaved}/>
                : <Center py="xl"><Loader aria-label="Cargando la orden"/></Center>}
        </Modal>
    )
}

function OrderEditorForm({order, full, readsStock, project, projectLocked, onClose, onSaved}) {
    const creating = order === null
    const teams = useTeams()
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            assetId: null,
            type: 'PREVENTIVE',
            title: order?.title ?? '',
            priority: order?.priority ?? 'MEDIUM',
            plannedDate: order?.plannedDate ?? null,
            teamId: order?.team?.id ?? null,
            assignedUser: order?.assignedUser ?? '',
            stockProjectId: project,
            closingNotes: order?.closingNotes ?? '',
            description: order?.description ?? '',
        },
        validate: {
            assetId: creating ? required('El activo es obligatorio') : null,
            type: creating ? required('El tipo es obligatorio') : null,
            title: full ? requiredText('El título es obligatorio', TITLE_LENGTH) : null,
            priority: required('La prioridad es obligatoria'),
            assignedUser: maxLength(USER_LENGTH),
        },
    })
    const saving = useSaveOrder()

    const save = form.onSubmit((values) => {
        const body = creating ? orderRequest(values) : orderPatch(order, values, {readsStock})
        if (body === null) {
            onClose()
            return
        }
        saving.mutate({id: creating ? null : order.id, body}, {
            onSuccess: (saved) => {
                notifySuccess(`Guardada ${saved.code}`)
                onClose()
                onSaved(saved)
            },
            onError: saveErrors(form),
        })
    })

    const priority = <Select label="Prioridad" withAsterisk allowDeselect={false} data={PRIORITY.selectable()} {...form.getInputProps('priority')}/>
    const description = <Textarea label="Descripción" rows={3} {...form.getInputProps('description')}/>

    return (
        <form onSubmit={save} noValidate>
            <Stack>
                {full
                    ? (
                        <SimpleGrid cols={{base: 1, sm: 2}}>
                            {creating && (
                                <>
                                    <AssetPicker label="Activo" withAsterisk {...form.getInputProps('assetId')}/>
                                    <Select label="Tipo" withAsterisk allowDeselect={false} data={ORDER_TYPE.selectable()}
                                            description="Una urgente arranca sin planificar y es siempre crítica" {...form.getInputProps('type')}/>
                                </>
                            )}
                            <TextInput label="Título" withAsterisk maxLength={TITLE_LENGTH} {...form.getInputProps('title')}/>
                            {priority}
                            <DateInput label="Prevista" clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                                       {...form.getInputProps('plannedDate')}/>
                            <TeamSelect label="Equipo" teams={teams.data} current={order?.team ?? null} {...form.getInputProps('teamId')}/>
                            <TextInput label="Asignada a" maxLength={USER_LENGTH} {...form.getInputProps('assignedUser')}/>
                            {readsStock && (
                                <StockPicker catalogue="projects" label="Proyecto de almacén" readOnly={projectLocked}
                                             description={projectLocked
                                                 ? 'Hay líneas de material esperando respuesta del almacén: el proyecto no cambia hasta que contesten'
                                                 : 'Vacío: el del paquete de ejecución, al planificar'}
                                             {...form.getInputProps('stockProjectId')}/>
                            )}
                        </SimpleGrid>
                    )
                    : (
                        <>
                            <Text size="sm">
                                {`La orden está ${ORDER_STATUS.label(order.status).toLowerCase()}: ya solo se cambian la descripción, la prioridad y `
                                    + 'las notas de cierre.'}
                            </Text>
                            {priority}
                            <Textarea label="Notas de cierre" rows={3} {...form.getInputProps('closingNotes')}/>
                        </>
                    )}
                {description}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" loading={saving.isPending}>Guardar</Button>
                </Group>
            </Stack>
        </form>
    )
}
