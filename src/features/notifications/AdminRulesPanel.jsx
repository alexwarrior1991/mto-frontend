import {Button, CloseButton, Group, Stack, Text, TextInput} from '@mantine/core'
import {IconRefresh, IconSearch} from '@tabler/icons-react'
import {useMemo, useState} from 'react'
import {ACTIVITY_SEVERITY} from '../../api/notification/enums.js'
import DataTable from '../../ui/DataTable.jsx'
import {normalizeText} from '../catalogues/catalogueRows.js'
import {rulesCountText, ruleSearchText, throttleText, variablesText} from './adminTexts.js'
import {useLoadedRules} from './useNotifications.js'

const text = (value) => value ?? ''

const COLUMNS = [
    {key: 'key', label: 'Clave', render: (rule) => text(rule.key)},
    {key: 'events', label: 'Eventos', render: (rule) => rule.events.join(', ')},
    {key: 'when', label: 'Condición', render: (rule) => text(rule.when)},
    {
        key: 'severity', label: 'Gravedad',
        render: (rule) => (rule.severity === null || rule.severity === undefined ? 'La del evento' : ACTIVITY_SEVERITY.label(rule.severity)),
    },
    {key: 'audiences', label: 'Audiencias', render: (rule) => rule.audiences.join(', ')},
    {key: 'channels', label: 'Canales', render: (rule) => rule.channels.join(', ')},
    {key: 'title', label: 'Título', render: (rule) => text(rule.title)},
    {key: 'link', label: 'Enlace', render: (rule) => text(rule.link)},
    {key: 'throttle', label: 'Freno', render: (rule) => throttleText(rule)},
]

/**
 * Las reglas que mto-notification tiene cargadas (GET /admin/rules, el port de AdminRulesPanel), de
 * solo lectura: se cambian en su YAML y se validan al arrancar el servicio, no aquí. Llegan enteras, así
 * que el filtro es local (sin mayúsculas ni tildes) sobre lo que se ve de cada una, y filtrar no llama.
 * Las audiencias, los canales y las plantillas se enseñan tal cual; el cuerpo, que es una plantilla
 * larga, no sale en la tabla.
 */
export default function AdminRulesPanel() {
    const loaded = useLoadedRules()
    const [filter, setFilter] = useState('')
    const data = loaded.isError ? null : loaded.data
    const rules = useMemo(() => data?.rules ?? [], [data])
    const shown = useMemo(() => {
        const needle = normalizeText(filter).trim()
        return needle === '' ? rules : rules.filter((rule) => ruleSearchText(rule).some((value) => normalizeText(value).includes(needle)))
    }, [rules, filter])
    const variables = data ? variablesText(data.variables) : ''

    return (
        <Stack>
            {data && <Text size="sm">Cargadas de {data.source}</Text>}
            {variables && <Text size="sm">{variables}</Text>}
            <Group justify="space-between" align="center">
                <Group gap="sm" align="center">
                    <TextInput aria-label="Filtrar las reglas" placeholder="Filtrar por clave, evento, audiencia, canal o texto" w={420}
                               leftSection={<IconSearch size={16}/>} value={filter}
                               onChange={(event) => setFilter(event.currentTarget.value)}
                               rightSection={filter
                                   ? <CloseButton size="sm" aria-label="Borrar el filtro" onClick={() => setFilter('')}/>
                                   : null}/>
                    <Text size="sm" c="dimmed" aria-live="polite">{data ? rulesCountText(shown.length, rules.length) : ''}</Text>
                </Group>
                <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={loaded.isFetching}
                        onClick={() => void loaded.refetch()}>
                    Actualizar
                </Button>
            </Group>
            <DataTable ariaLabel="Reglas" columns={COLUMNS} rows={shown} loading={loaded.isPending} rowKey={(rule) => rule.key}
                       minWidth={1500} emptyText={emptyText(loaded, rules)}/>
        </Stack>
    )
}

function emptyText(loaded, rules) {
    if (loaded.isError) {
        return 'No se han podido leer las reglas.'
    }
    return rules.length === 0 ? 'El servicio no tiene ninguna regla cargada.' : 'Ninguna regla coincide con el filtro.'
}
