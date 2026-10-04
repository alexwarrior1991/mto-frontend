import {Button, Group, Modal, SimpleGrid, Stack, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {ApiError} from '../../api/errors.js'
import {reservationRequest, reservationUpdateRequest} from '../../api/stock/reservations.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_TIME_FORMAT, parseTypedDateTime} from '../../ui/typedDates.js'
import {positiveQuantity, required, toQuantityText} from './stockForms.js'
import StockPicker from './StockPicker.jsx'
import {quantityWithUnit} from './stockTexts.js'
import {useSaveReservation} from './useStock.js'

/**
 * El alta o la modificación de una reserva (el port de ReservationDialog): material, almacén,
 * proyecto y cantidad, y en el alta, cuándo se reservó (vacío: ahora). Al modificar, el material no
 * se toca, porque el servicio no lo cambia y la modificación no lo lleva.
 *
 * Que haya disponible lo dice el servicio (409 STK-001), y que la reserva siga activa al modificarla,
 * también (422 RES-001): el aviso lo dice y el diálogo sigue abierto con lo escrito. Los campos se
 * llaman como los de la petición, así que un error del servicio por campo cae en el suyo.
 *
 * @param {object|null} reservation la reserva que se modifica, o null para un alta
 */
export default function ReservationModal({reservation, onClose}) {
    const creating = reservation === null
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            materialId: reservation?.material ?? null,
            warehouseId: reservation?.warehouse ?? null,
            projectId: reservation?.project ?? null,
            quantity: toQuantityText(reservation?.quantity),
            reservedAt: null,
        },
        validate: {
            materialId: required('Elige el material'),
            warehouseId: required('Elige el almacén'),
            projectId: required('Elige el proyecto'),
            quantity: positiveQuantity,
        },
    })
    const saving = useSaveReservation()

    const save = form.onSubmit((values) => {
        const ids = {warehouseId: values.warehouseId.id, projectId: values.projectId.id, quantity: values.quantity}
        const body = creating
            ? reservationRequest({...ids, materialId: values.materialId.id, reservedAt: values.reservedAt})
            : reservationUpdateRequest(ids)
        saving.mutate({id: creating ? null : reservation.id, body}, {
            onSuccess: (saved) => {
                const material = saved?.material ?? values.materialId
                const project = saved?.project ?? values.projectId
                notifySuccess(`${creating ? 'Reserva registrada' : 'Reserva modificada'}: `
                    + `${quantityWithUnit(saved?.quantity ?? values.quantity, material)} de ${material.code} para ${project.code}`)
                onClose()
            },
            onError: (error) => {
                if (error instanceof ApiError && error.hasFieldErrors) {
                    notifyMessages(applyServerErrors(form, error))
                } else {
                    notifyApiError(error)
                }
            },
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="lg"
               title={creating ? 'Nueva reserva' : `Modificar la reserva de ${reservation.material?.code ?? '?'}`}>
            <form onSubmit={save} noValidate>
                <Stack>
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <StockPicker catalogue="materials" label="Material" withAsterisk readOnly={!creating}
                                     {...form.getInputProps('materialId')}/>
                        <StockPicker catalogue="warehouses" label="Almacén" withAsterisk {...form.getInputProps('warehouseId')}/>
                        <StockPicker catalogue="projects" label="Proyecto" withAsterisk {...form.getInputProps('projectId')}/>
                        <TextInput label="Cantidad" withAsterisk inputMode="decimal" {...form.getInputProps('quantity')}/>
                        {creating && (
                            <DateInput label="Reservada el" description="Vacío: ahora" withTime clearable valueFormat={DATE_TIME_FORMAT}
                                       dateParser={parseTypedDateTime} placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('reservedAt')}/>
                        )}
                    </SimpleGrid>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={saving.isPending}>Guardar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}
