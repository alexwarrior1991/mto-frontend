import {Button, Group, Modal, Select, SimpleGrid, Stack, Text, Textarea, TextInput} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useForm} from '@mantine/form'
import {ApiError} from '../../api/errors.js'
import {
    ADJUSTMENT_DIRECTIONS,
    adjustmentRequest,
    entryRequest,
    outputRequest,
    registerAdjustment,
    registerEntry,
    registerOutput,
    registerTransfer,
    transferRequest,
} from '../../api/stock/movements.js'
import {notifyApiError, notifyMessages} from '../../ui/errors/notifyError.js'
import {applyServerErrors} from '../../ui/errors/serverValidation.js'
import {notifySuccess} from '../../ui/notifySuccess.js'
import {DATE_TIME_FORMAT, parseTypedDateTime} from '../../ui/typedDates.js'
import {maxLength, positiveQuantity, REFERENCE_MAX_LENGTH, required, toQuantityText} from './stockForms.js'
import StockPicker from './StockPicker.jsx'
import {quantityWithUnit} from './stockTexts.js'
import {useRegisterMovement} from './useStock.js'

/** Las cuatro operaciones que escriben en el libro. */
const KINDS = Object.freeze({
    entry: Object.freeze({title: 'Entrada', done: 'Entrada registrada', register: registerEntry, request: entryRequest}),
    output: Object.freeze({title: 'Salida', done: 'Salida registrada', register: registerOutput, request: outputRequest}),
    transfer: Object.freeze({title: 'Transferencia', done: 'Transferencia registrada', register: registerTransfer, request: transferRequest}),
    adjustment: Object.freeze({title: 'Ajuste de inventario', done: 'Ajuste registrado', register: registerAdjustment, request: adjustmentRequest}),
})

/** Los campos del servicio que no se llaman como los del diálogo. */
const FIELD_ALIASES = Object.freeze({sourceWarehouseId: 'warehouseId', differentWarehouses: 'targetWarehouseId'})

/**
 * Un apunte nuevo en el libro (el port de MovementDialog): una entrada (con proveedor opcional), una
 * salida (con proyecto opcional), una transferencia a otro almacén o un ajuste, positivo o negativo.
 *
 * Aquí solo se exige lo evidente: material, almacén, una cantidad mayor que cero y, en una
 * transferencia, un destino distinto del origen. Que haya stock lo dice el servicio (409 STK-001), y
 * que el material y el almacén sigan activos, también; el aviso lo dice y el diálogo sigue abierto con
 * lo escrito, igual que con un error por campo, que cae en su campo.
 *
 * Una salida con reservationId consume esa reserva: material, almacén y cantidad vienen puestos y no
 * se tocan, porque el servicio exige que sean los reservados; el proyecto viene de la reserva, que el
 * servicio no copia. Referencia y notas son lo que esta salida añade al consumo directo.
 *
 * @param {'entry'|'output'|'transfer'|'adjustment'} kind
 * @param {object} [initial] lo que ya se sabe: material, almacén y proyecto elegidos en la pantalla, o la reserva
 */
export default function MovementModal({kind, initial = {}, onClose}) {
    const operation = KINDS[kind]
    const consumingReservation = Boolean(initial.reservationId)
    const form = useForm({
        mode: 'controlled',
        initialValues: {
            materialId: initial.material ?? null,
            warehouseId: initial.warehouse ?? null,
            targetWarehouseId: null,
            supplierId: null,
            projectId: initial.project ?? null,
            reservationId: initial.reservationId ?? null,
            direction: 'POSITIVE',
            quantity: toQuantityText(initial.quantity),
            occurredAt: null,
            externalReference: '',
            notes: '',
        },
        validate: {
            materialId: required('Elige el material'),
            warehouseId: required('Elige el almacén'),
            targetWarehouseId: (value, values) => (kind === 'transfer' ? targetError(value, values.warehouseId) : null),
            direction: (value) => (kind === 'adjustment' ? required('Elige el sentido')(value) : null),
            quantity: positiveQuantity,
            externalReference: maxLength(REFERENCE_MAX_LENGTH),
        },
    })
    const registering = useRegisterMovement()

    const save = form.onSubmit((values) => {
        const body = operation.request({
            materialId: values.materialId.id,
            warehouseId: values.warehouseId.id,
            targetWarehouseId: values.targetWarehouseId?.id ?? null,
            supplierId: values.supplierId?.id ?? null,
            projectId: values.projectId?.id ?? null,
            reservationId: values.reservationId,
            direction: values.direction,
            quantity: values.quantity,
            occurredAt: values.occurredAt,
            externalReference: values.externalReference,
            notes: values.notes,
        })
        registering.mutate({register: operation.register, body}, {
            onSuccess: () => {
                notifySuccess(`${operation.done}: ${quantityWithUnit(values.quantity, values.materialId)} de ${values.materialId.code}`)
                onClose()
            },
            onError: (error) => {
                if (error instanceof ApiError && error.hasFieldErrors) {
                    notifyMessages(applyServerErrors(form, error, {aliases: FIELD_ALIASES}))
                } else {
                    notifyApiError(error)
                }
            },
        })
    })

    return (
        <Modal opened onClose={onClose} closeOnClickOutside={false} size="xl" title={operation.title}>
            <form onSubmit={save} noValidate>
                <Stack>
                    {consumingReservation && (
                        <Text size="sm">Esta salida consume la reserva: el material, el almacén y la cantidad son los reservados.</Text>
                    )}
                    <SimpleGrid cols={{base: 1, sm: 2}}>
                        <StockPicker catalogue="materials" label="Material" withAsterisk readOnly={consumingReservation}
                                     {...form.getInputProps('materialId')}/>
                        <StockPicker catalogue="warehouses" label={kind === 'transfer' ? 'Almacén de origen' : 'Almacén'} withAsterisk
                                     readOnly={consumingReservation} {...form.getInputProps('warehouseId')}/>
                        {kind === 'entry' && <StockPicker catalogue="suppliers" label="Proveedor" {...form.getInputProps('supplierId')}/>}
                        {kind === 'output' && <StockPicker catalogue="projects" label="Proyecto" {...form.getInputProps('projectId')}/>}
                        {kind === 'transfer' && (
                            <StockPicker catalogue="warehouses" label="Almacén de destino" withAsterisk {...form.getInputProps('targetWarehouseId')}/>
                        )}
                        {kind === 'adjustment' && (
                            <Select label="Sentido" withAsterisk allowDeselect={false} data={ADJUSTMENT_DIRECTIONS}
                                    {...form.getInputProps('direction')}/>
                        )}
                        <TextInput label="Cantidad" withAsterisk inputMode="decimal" readOnly={consumingReservation}
                                   {...form.getInputProps('quantity')}/>
                        <DateInput label="Fecha y hora" description="Vacío: ahora" withTime clearable valueFormat={DATE_TIME_FORMAT}
                                   dateParser={parseTypedDateTime} placeholder="DD/MM/AAAA HH:mm" {...form.getInputProps('occurredAt')}/>
                        <TextInput label="Referencia externa" description="El albarán, la orden de trabajo…" maxLength={REFERENCE_MAX_LENGTH}
                                   {...form.getInputProps('externalReference')}/>
                    </SimpleGrid>
                    <Textarea label="Notas" rows={3} resize="vertical" {...form.getInputProps('notes')}/>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={registering.isPending}>Registrar</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    )
}

function targetError(target, source) {
    if (!target) {
        return 'Elige el almacén de destino'
    }
    return source && target.id === source.id ? 'El destino tiene que ser otro almacén' : null
}
