import {CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {useState} from 'react'
import {MOVEMENT_TYPE} from '../../api/stock/movements.js'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import MovementsTable from './MovementsTable.jsx'
import StockOperations from './StockOperations.jsx'
import StockPicker from './StockPicker.jsx'
import {countText} from './stockTexts.js'
import {useMovementList} from './useStock.js'

const TYPING_DELAY_MS = 400

/**
 * El libro de movimientos entero (el port de MovementsView), paginado en el servidor. Se filtra por
 * tipo, almacén, material, proyecto, días (los dos extremos enteros) y quién lo registró, y se opera
 * desde aquí con lo que está elegido en los filtros. El libro solo crece: un apunte equivocado se
 * corrige con un ajuste.
 *
 * El tipo no ofrece «Desconocido»: un apunte de un tipo que esta versión no conoce se pinta así, pero
 * no se puede pedir. Los desplegables ofrecen también lo retirado, para encontrar lo de antes.
 */
export default function MovementsPage({title}) {
    const [type, setType] = useState(null)
    const [warehouse, setWarehouse] = useState(null)
    const [material, setMaterial] = useState(null)
    const [project, setProject] = useState(null)
    const [fromDay, setFromDay] = useState(null)
    const [toDay, setToDay] = useState(null)
    const [user, setUser] = useState('')
    const [typedUser] = useDebouncedValue(user, TYPING_DELAY_MS)
    const [sort, setSort] = useState(null)

    const filters = {
        type,
        warehouseId: warehouse?.id ?? null,
        materialId: material?.id ?? null,
        projectId: project?.id ?? null,
        fromDay,
        toDay,
        user: typedUser.trim(),
    }
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useMovementList({...filters, page, sort})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')

    const prefill = () => ({material, warehouse, project})

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Tipo" placeholder="Todos" clearable w={210} data={MOVEMENT_TYPE.selectable()} value={type} onChange={setType}/>
                <StockPicker catalogue="warehouses" label="Almacén" w={230} includeRetired value={warehouse} onChange={setWarehouse}/>
                <StockPicker catalogue="materials" label="Material" w={280} includeRetired value={material} onChange={setMaterial}/>
                <StockPicker catalogue="projects" label="Proyecto" w={230} includeRetired value={project} onChange={setProject}/>
                <DateInput label="Desde" w={140} clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={fromDay} onChange={setFromDay}/>
                <DateInput label="Hasta" w={140} clearable valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={toDay} onChange={setToDay}/>
                <TextInput label="Registrado por" placeholder="Usuario" w={180} value={user}
                           onChange={(event) => setUser(event.currentTarget.value)}
                           rightSection={user ? <CloseButton size="sm" aria-label="Borrar el usuario" onClick={() => setUser('')}/> : null}/>
            </Group>
            <Group justify="space-between" align="center" gap="sm">
                <Text size="sm" c="dimmed" aria-live="polite">
                    {list.data ? countText(list.data.totalElements, 'movimiento', 'movimientos') : ''}
                </Text>
                <StockOperations prefill={prefill}/>
            </Group>
            <MovementsTable ariaLabel={title} list={list} page={page} sort={sort} onSortChange={setSort}
                            onPageChange={(next) => setPaging({key: listKey, page: next})} withMaterial
                            emptyText={filtering ? 'Ningún movimiento coincide con los filtros.' : 'El libro está vacío.'}/>
        </Stack>
    )
}
