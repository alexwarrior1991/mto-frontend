import {Button, Group, Modal, Select, Stack, Textarea, TextInput} from '@mantine/core'
import {useForm} from '@mantine/form'
import {resolveRequest} from '../../api/maintenance/defects.js'
import {DEFECT_STATUS, ORDER_STATUS} from '../../api/maintenance/enums.js'
import {notifyApiError} from '../../ui/errors/notifyError.js'
import {formatDate} from '../../ui/format.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {maxLength, required, requiredText} from './maintenanceForms.js'
import {useDefectTransition, useOpenOrdersOnTrack, useRecentShiftsOn} from './useMaintenance.js'

const CORRECTION_LENGTH = 120
const NOTES_LENGTH = 4000

/**
 * Las transiciones de un defecto con datos (el port de DefectTransitionDialogs): vincularlo a una orden
 * abierta de su vía, y resolverlo (con maintenance-supervise). Con una orden vinculada sin completar,
 * resolverlo pide el turno en el que se corrigió in situ; si no se da, el servicio lo rechaza (409
 * TRN-001) y el diálogo sigue abierto.
 */

/** Vincular a una orden abierta de la vía del defecto: desde abierto pasa a en curso; en curso, se re-vincula. */
export function LinkOrderModal({defect, onClose}) {
    const orders = useOpenOrdersOnTrack(defect.trackId)
    const form = useForm({mode: 'controlled', initialValues: {orderId: null}, validate: {orderId: required('Elige una orden')}})
    const linking = useDefectTransition(defect.id)
    const candidates = orders.data ?? []
    const save = form.onSubmit(({orderId}) => {
        linking.mutate({transition: 'link', orderId}, {
            onSuccess: (linked) => {
                notifySuccess(`${linked.code} vinculado a ${candidates.find((order) => order.id === orderId)?.code ?? 'la orden'}`)
                onClose()
            },
            onError: (error) => notifyApiError(error),
        })
    })
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Vincular ${defect.code} a una orden`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Select label="Orden" withAsterisk searchable description="Las órdenes abiertas de la vía del defecto"
                            nothingFoundMessage="Ninguna orden abierta en su vía"
                            data={candidates.map((order) => ({value: order.id, label: `${order.code} · ${order.title} (${ORDER_STATUS.label(order.status)
                                .toLowerCase()})`}))}
                            {...form.getInputProps('orderId')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={linking.isPending}>Vincular</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

/** Resolver: cómo se resolvió y, si su orden no está completada, en qué turno se corrigió. */
export function ResolveDefectModal({defect, onClose}) {
    const shifts = useRecentShiftsOn(defect.trackId)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            resolutionNotes: '', resolvedInShiftId: null, correctionType: defect.correctionType ?? '', partsReplaced: defect.partsReplaced ?? '',
        },
        validate: {
            resolutionNotes: requiredText('Hay que decir cómo se resolvió', NOTES_LENGTH),
            correctionType: maxLength(CORRECTION_LENGTH),
        },
    })
    const resolving = useDefectTransition(defect.id)
    const save = form.onSubmit((values) => {
        resolving.mutate({transition: 'resolve', body: resolveRequest(values)}, {
            onSuccess: (resolved) => {
                notifySuccess(`${resolved.code} ${DEFECT_STATUS.label(resolved.status).toLowerCase()}`)
                onClose()
            },
            onError: (error) => notifyApiError(error),
        })
    })
    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} title={`Resolver ${defect.code}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <Textarea label="Cómo se resolvió" withAsterisk rows={3} {...form.getInputProps('resolutionNotes')}/>
                    <Select label="Turno en el que se corrigió" clearable description="Obligatorio si su orden no está completada"
                            nothingFoundMessage="Ningún turno en su vía"
                            data={(shifts.data?.content ?? []).map((shift) => ({value: shift.id, label: `${shift.code} · ${formatDate(shift.shiftDate)}`}))}
                            {...form.getInputProps('resolvedInShiftId')}/>
                    <TextInput label="Tipo de corrección" maxLength={CORRECTION_LENGTH} {...form.getInputProps('correctionType')}/>
                    <TextInput label="Piezas cambiadas" {...form.getInputProps('partsReplaced')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Volver</Button>
                        <Button type="submit" loading={resolving.isPending}>Resolver</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
