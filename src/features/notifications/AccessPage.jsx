import {Button, CloseButton, Group, Select, Stack, Text, TextInput, Title} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {IconListSearch, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {useSearchParams} from 'react-router'
import {ACTIVITY_PAGE_SIZE, isIpLiteral} from '../../api/notification/activity.js'
import {ACCESS_OUTCOME, ACTIVITY_SEVERITY} from '../../api/notification/enums.js'
import {formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {AccessEventModal} from './EventDetailModal.jsx'
import {countText, eventCountText} from './notificationTexts.js'
import {useAccessList} from './useNotifications.js'

const SEARCH_DELAY_MS = 300

/**
 * actividad/accesos: los accesos (el port de AccessView): logins, fallos, rachas, logouts, bloqueos y
 * cambios de credenciales, con usuario e IP. Es la única categoría que lleva la IP, y por eso tiene su
 * permiso aparte (notification-access-read), que no viene con el registro.
 *
 * - Las reglas de mto-notification enlazan aquí con el usuario o la IP en la URL
 *   (/actividad/accesos?username=...), que se aplican al entrar; otra URL empieza de cero (key).
 * - La IP es un literal, no un rango: una a medio escribir no se pide (el servicio la rechazaría).
 * - La lista ya trae cada acceso con su payload: el detalle es la propia fila.
 */
export default function AccessPage({title}) {
    const [params] = useSearchParams()
    return <AccessLog key={params.toString()} title={title} initial={filtersFrom(params)}/>
}

function filtersFrom(params) {
    const outcome = params.get('outcome')
    return {
        username: params.get('username') ?? '',
        ipAddress: params.get('ipAddress') ?? '',
        type: params.get('type') ?? '',
        outcome: ACCESS_OUTCOME.isKnown(outcome) ? outcome : null,
    }
}

function AccessLog({title, initial}) {
    const [texts, setTexts] = useState({username: initial.username, ipAddress: initial.ipAddress, type: initial.type})
    const [debounced] = useDebouncedValue(texts, SEARCH_DELAY_MS)
    const [outcome, setOutcome] = useState(initial.outcome)
    const [from, setFrom] = useState(null)
    const [to, setTo] = useState(null)
    const [sort, setSort] = useState(null)
    const filters = {
        username: debounced.username.trim(), ipAddress: debounced.ipAddress.trim(), type: debounced.type.trim(), outcome, from, to,
    }
    const ipValid = filters.ipAddress === '' || isIpLiteral(filters.ipAddress)
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useAccessList({...filters, page, sort}, {enabled: ipValid})
    const filtering = Object.values(filters).some((value) => value !== null && value !== '')
    const [opened, setOpened] = useState(null)

    const text = (key, label, placeholder, width, error = null) => (
        <TextInput label={label} placeholder={placeholder} w={width} value={texts[key]} error={error}
                   onChange={(event) => {
                       const value = event.currentTarget.value
                       setTexts((current) => ({...current, [key]: value}))
                   }}
                   rightSection={texts[key]
                       ? <CloseButton size="sm" aria-label={`Borrar ${label === 'IP' ? 'la IP' : label.toLowerCase()}`}
                                      onClick={() => setTexts((current) => ({...current, [key]: ''}))}/>
                       : null}/>
    )

    const columns = [
        {key: 'occurredAt', label: 'Cuándo', sortField: 'occurredAt', render: (event) => formatDateTime(event.occurredAt)},
        {key: 'type', label: 'Tipo', sortField: 'type', render: (event) => event.type ?? ''},
        {key: 'outcome', label: 'Resultado', render: (event) => ACCESS_OUTCOME.label(event.outcome)},
        {key: 'username', label: 'Usuario', render: (event) => event.username ?? ''},
        {key: 'ipAddress', label: 'IP', render: (event) => event.ipAddress ?? ''},
        {key: 'severity', label: 'Gravedad', sortField: 'severity', render: (event) => ACTIVITY_SEVERITY.label(event.severity)},
        {key: 'count', label: 'Eventos', render: (event) => eventCountText(event.eventCount)},
        {key: 'correlationId', label: 'Correlación', render: (event) => event.correlationId ?? ''},
    ]
    const rows = ipValid ? list.data?.content ?? [] : []

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                {text('username', 'Usuario', null, 200)}
                {text('ipAddress', 'IP', '10.0.0.7', 170, ipValid ? null : 'Una IPv4 o IPv6 completa, como 10.0.0.7 o ::1')}
                {text('type', 'Tipo', 'access.login.failed', 220)}
                <Select label="Resultado" placeholder="Todos" clearable w={150} data={ACCESS_OUTCOME.selectable()} value={outcome}
                        onChange={setOutcome}/>
                <DateInput label="Desde" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={from} onChange={setFrom}/>
                <DateInput label="Hasta" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={to} onChange={setTo}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">
                    {ipValid && list.data ? countText(list.data.totalElements, 'acceso', 'accesos') : ''}
                </Text>
                <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={list.isFetching} disabled={!ipValid}
                        onClick={() => void list.refetch()}>
                    Recargar
                </Button>
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={rows} loading={ipValid && list.isPending}
                             emptyText={emptyText(list, filtering, ipValid)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={ACTIVITY_PAGE_SIZE} totalElements={ipValid ? list.data?.totalElements ?? 0 : 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1200} onRowDoubleClick={setOpened}
                             rowActions={(event) => <RowActionButton label={`Detalle de ${event.type}`} tooltip="El acceso entero"
                                                                     icon={IconListSearch} onClick={() => setOpened(event)}/>}/>
            {opened && <AccessEventModal event={opened} onClose={() => setOpened(null)}/>}
        </Stack>
    )
}

function emptyText(list, filtering, ipValid) {
    if (!ipValid) {
        return 'Escribe una IP completa para buscar sus accesos.'
    }
    if (list.isError) {
        return 'No se han podido leer los accesos.'
    }
    return filtering ? 'Ningún acceso coincide con los filtros.' : 'No hay accesos registrados.'
}
