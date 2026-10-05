import {Badge, Button, Checkbox, CloseButton, Group, Select, Stack, Text, TextInput, Title, Tooltip} from '@mantine/core'
import {DateInput} from '@mantine/dates'
import {useDebouncedValue} from '@mantine/hooks'
import {IconListSearch, IconRefresh} from '@tabler/icons-react'
import {useState} from 'react'
import {useSearchParams} from 'react-router'
import {ACTIVITY_PAGE_SIZE} from '../../api/notification/activity.js'
import {ACTIVITY_CATEGORY, ACTIVITY_SEVERITY, activityCategories} from '../../api/notification/enums.js'
import {actorText, subjectText} from '../../api/notification/values.js'
import {formatDateTime} from '../../ui/format.js'
import RowActionButton from '../../ui/RowActionButton.jsx'
import ServerDataTable from '../../ui/ServerDataTable.jsx'
import {DATE_FORMAT, parseTypedDate} from '../../ui/typedDates.js'
import {ActivityEventModal} from './EventDetailModal.jsx'
import {countText, eventCountText} from './notificationTexts.js'
import {useActivityList} from './useNotifications.js'

const SEARCH_DELAY_MS = 300

/**
 * actividad: el registro de actividad (el port de ActivityView), todo lo que pasa en el dominio salvo
 * los accesos, que tienen su pantalla y su permiso. Paginado, filtrado y ordenado en el servidor, lo
 * más reciente primero; una línea abre su detalle, que trae el payload que la lista no trae.
 *
 * - Los filtros son los del servicio y se comparan allí: un tipo se escribe entero
 *   (maintenance.order.created), porque el catálogo de tipos es del servicio y aquí no se copia.
 * - La categoría nunca ofrece los accesos: el servicio los rechaza aquí con 400.
 * - Lo fundido (el evento de administración de Keycloak que ya cuenta el de mto-users del mismo
 *   cambio) solo se enseña si se pide.
 * - Las reglas de mto-notification enlazan aquí con los filtros en la URL (/actividad?category=SYSTEM),
 *   que se aplican al entrar; lo que no se conoce se ignora. Otra URL empieza de cero (key).
 */
export default function ActivityPage({title}) {
    const [params] = useSearchParams()
    return <ActivityLog key={params.toString()} title={title} initial={filtersFrom(params)}/>
}

function filtersFrom(params) {
    const category = params.get('category')
    const severity = params.get('severity')
    return {
        category: activityCategories().some((option) => option.value === category) ? category : null,
        type: params.get('type') ?? '',
        actorUsername: params.get('actorUsername') ?? '',
        subjectType: params.get('subjectType') ?? '',
        subjectId: params.get('subjectId') ?? '',
        severity: ACTIVITY_SEVERITY.isKnown(severity) ? severity : null,
        sourceService: params.get('sourceService') ?? '',
        includeSuperseded: params.get('includeSuperseded') === 'true',
    }
}

function ActivityLog({title, initial}) {
    const [category, setCategory] = useState(initial.category)
    const [severity, setSeverity] = useState(initial.severity)
    const [texts, setTexts] = useState({
        type: initial.type, actorUsername: initial.actorUsername, subjectType: initial.subjectType, subjectId: initial.subjectId,
        sourceService: initial.sourceService,
    })
    const [debounced] = useDebouncedValue(texts, SEARCH_DELAY_MS)
    const [from, setFrom] = useState(null)
    const [to, setTo] = useState(null)
    const [includeSuperseded, setIncludeSuperseded] = useState(initial.includeSuperseded)
    const [sort, setSort] = useState(null)
    const filters = {
        category, severity, from, to, includeSuperseded,
        ...Object.fromEntries(Object.entries(debounced).map(([key, value]) => [key, value.trim()])),
    }
    // La página vuelve a la primera en cuanto cambia lo que se pide.
    const listKey = JSON.stringify([filters, sort])
    const [paging, setPaging] = useState({key: listKey, page: 1})
    const page = paging.key === listKey ? paging.page : 1
    const list = useActivityList({...filters, page, sort})
    const filtering = Object.entries(filters).some(([key, value]) => key !== 'includeSuperseded' && value !== null && value !== '')
    const [eventId, setEventId] = useState(null)

    const text = (key, label, placeholder, width) => (
        <TextInput label={label} placeholder={placeholder} w={width} value={texts[key]}
                   onChange={(event) => {
                       const value = event.currentTarget.value
                       setTexts((current) => ({...current, [key]: value}))
                   }}
                   rightSection={texts[key]
                       ? <CloseButton size="sm" aria-label={`Borrar ${label.toLowerCase()}`}
                                      onClick={() => setTexts((current) => ({...current, [key]: ''}))}/>
                       : null}/>
    )

    const columns = [
        {key: 'occurredAt', label: 'Cuándo', sortField: 'occurredAt', render: (event) => formatDateTime(event.occurredAt)},
        {key: 'category', label: 'Categoría', render: (event) => ACTIVITY_CATEGORY.label(event.category)},
        {key: 'type', label: 'Tipo', sortField: 'type', render: (event) => <TypeCell event={event}/>},
        {key: 'severity', label: 'Gravedad', sortField: 'severity', render: (event) => ACTIVITY_SEVERITY.label(event.severity)},
        {key: 'actor', label: 'Quién', render: (event) => actorText(event.actor)},
        {key: 'subject', label: 'Sobre qué', render: (event) => subjectText(event.subject)},
        {key: 'source', label: 'Origen', render: (event) => event.sourceService ?? ''},
        {key: 'count', label: 'Eventos', render: (event) => eventCountText(event.eventCount)},
    ]

    return (
        <Stack>
            <Title order={2}>{title}</Title>
            <Group align="flex-end" gap="sm">
                <Select label="Categoría" placeholder="Todas" clearable w={180} data={activityCategories()} value={category} onChange={setCategory}/>
                {text('type', 'Tipo', 'maintenance.order.created', 240)}
                {text('actorUsername', 'Quién', null, 190)}
                {text('subjectType', 'Tipo de sujeto', 'order', 150)}
                {text('subjectId', 'Id de sujeto', null, 190)}
                <Select label="Gravedad" placeholder="Todas" clearable w={160} data={ACTIVITY_SEVERITY.selectable()} value={severity}
                        onChange={setSeverity}/>
                {text('sourceService', 'Origen', 'mto-maintenance', 180)}
                <DateInput label="Desde" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={from} onChange={setFrom}/>
                <DateInput label="Hasta" clearable w={150} valueFormat={DATE_FORMAT} dateParser={parseTypedDate} placeholder="DD/MM/AAAA"
                           value={to} onChange={setTo}/>
                <Checkbox label="Incluir los fundidos" checked={includeSuperseded} mb={8}
                          description="Los eventos de administración de Keycloak que ya cuenta el de mto-users del mismo cambio"
                          onChange={(event) => setIncludeSuperseded(event.currentTarget.checked)}/>
            </Group>
            <Group justify="space-between" align="flex-end">
                <Text size="sm" c="dimmed" aria-live="polite">{list.data ? countText(list.data.totalElements, 'evento', 'eventos') : ''}</Text>
                <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={list.isFetching} onClick={() => void list.refetch()}>
                    Recargar
                </Button>
            </Group>
            <ServerDataTable ariaLabel={title} columns={columns} rows={list.data?.content ?? []} loading={list.isPending}
                             emptyText={emptyText(list, filtering)} sort={sort} onSortChange={setSort} page={page}
                             pageSize={ACTIVITY_PAGE_SIZE} totalElements={list.data?.totalElements ?? 0}
                             onPageChange={(next) => setPaging({key: listKey, page: next})} minWidth={1300}
                             onRowDoubleClick={(event) => setEventId(event.id)}
                             rowActions={(event) => <RowActionButton label={`Detalle de ${event.type}`} tooltip="La línea entera"
                                                                     icon={IconListSearch} onClick={() => setEventId(event.id)}/>}/>
            {eventId && <ActivityEventModal eventId={eventId} onClose={() => setEventId(null)}/>}
        </Stack>
    )
}

/** El tipo, y si la línea está fundida en otra, la marca que lo dice. */
function TypeCell({event}) {
    if (!event.supersededBy) {
        return event.type ?? ''
    }
    return (
        <Group gap={6} wrap="nowrap">
            <span>{event.type ?? ''}</span>
            <Tooltip label="La cuenta otra línea: el cambio que hizo mto-users" withArrow>
                <Badge size="sm" variant="light" color="gray">Fundida</Badge>
            </Tooltip>
        </Group>
    )
}

function emptyText(list, filtering) {
    if (list.isError) {
        return 'No se ha podido leer el registro.'
    }
    return filtering ? 'Ninguna línea coincide con los filtros.' : 'El registro está vacío.'
}
