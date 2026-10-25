import {Anchor, Button, Center, Group, Loader, Stack, Text, Title} from '@mantine/core'
import {IconRefresh} from '@tabler/icons-react'
import {Link} from 'react-router'
import {PERSON_CATEGORY} from '../../api/resources/enums.js'
import {DISCREPANCY_SECTIONS} from '../../api/resources/reports.js'
import DataTable from '../../ui/DataTable.jsx'
import {errorMessage} from '../../ui/errors/messages.js'
import {formatDateTime} from '../../ui/format.js'
import {personPath} from './resourcesRoutes.js'
import {join} from './resourcesTexts.js'
import {usePositionDiscrepancies} from './useResources.js'

const COLUMNS = Object.freeze([
    {key: 'person', label: 'Persona', render: (row) => {
        const name = join(row.personCode, row.fullName)
        return row.personId ? <Anchor component={Link} to={personPath(row.personId)} size="sm">{name}</Anchor> : name
    }},
    {key: 'username', label: 'Usuario', render: (row) => row.username ?? ''},
    {key: 'category', label: 'Categoría', render: (row) => PERSON_CATEGORY.label(row.category)},
    {key: 'expected', label: 'Perfil esperado', render: (row) => row.expectedProfile ?? ''},
    {key: 'profiles', label: 'Perfiles', render: (row) => (row.profiles ?? []).join(', ')},
])

/**
 * recursos/discrepancias: dónde no casan el perfil de puesto de Keycloak (lo que alguien puede hacer) y la
 * categoría de su ficha (el puesto que ocupa), el port de PositionDiscrepanciesView. Lo calcula
 * mto-resources al pedirlo, leyendo Keycloak: con otro perfil, con varios, sin ninguno, y usuarios con
 * perfil de puesto y sin ficha activa. Dice, no arregla: un suplente puede llevar otro perfil a propósito.
 * Si Keycloak no responde (503 KCK-503), se dice aquí con «Reintentar»; «Actualizar» lo vuelve a pedir.
 */
export default function PositionDiscrepanciesPage({title}) {
    const report = usePositionDiscrepancies()
    // Si la última vez falló, el informe anterior ya no vale: se dice el fallo en su sitio, como el
    // backoffice, que vacía el informe antes de volver a pedirlo.
    const failed = report.isError
    const data = failed ? null : report.data

    return (
        <Stack>
            <Group justify="space-between" align="flex-end">
                <Title order={2}>{title}</Title>
                {data && (
                    <Button variant="default" leftSection={<IconRefresh size={16}/>} loading={report.isFetching} onClick={() => void report.refetch()}>
                        Actualizar
                    </Button>
                )}
            </Group>
            {failed && !report.isFetching && (
                <Stack align="flex-start" gap="xs">
                    <Text role="alert">No se ha podido calcular el informe: {errorMessage(report.error)}</Text>
                    <Button leftSection={<IconRefresh size={16}/>} onClick={() => void report.refetch()}>Reintentar</Button>
                </Stack>
            )}
            {(report.isPending || (failed && report.isFetching)) && <Center py="xl"><Loader aria-label="Calculando el informe"/></Center>}
            {data && (
                <>
                    <Text size="sm" c="dimmed" aria-label="Resumen del informe">
                        {join(`Calculado ${formatDateTime(data.generatedAt)}`, `${data.peopleChecked} personas con usuario`,
                            `${data.usersWithPosition} usuarios con perfil de puesto`)}
                    </Text>
                    {DISCREPANCY_SECTIONS.map((section) => {
                        const rows = data[section.key] ?? []
                        return (
                            <Stack key={section.key} gap="xs">
                                <Title order={4}>{section.title}</Title>
                                {rows.length === 0
                                    ? <Text size="sm" c="dimmed">Nada</Text>
                                    : <DataTable ariaLabel={section.title} columns={COLUMNS} rows={rows} rowKey={(row) => `${row.personId}-${row.username}`}
                                                 minWidth={800}/>}
                            </Stack>
                        )
                    })}
                </>
            )}
        </Stack>
    )
}
