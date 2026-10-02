import {Box, Button, Group, Modal, ScrollArea, Stack, Text} from '@mantine/core'
import {useMemo} from 'react'
import SchematicSvg from './SchematicSvg.jsx'
import {LEGEND, normalizeSchematic, schematicSummary, schematicTitle} from './schematicLayout.js'

/**
 * La ventana con el esquema de una vía (el port de TrackSchematicDialog): la vía y su paquete en el
 * título, un resumen con los recuentos y las estaciones, y el dibujo con desplazamiento horizontal,
 * porque una vía de 600 perfiles mide 600 pasos. Recibe la proyección que devolvió el servicio y no
 * vuelve a pedir nada. Una vía sin perfiles lo dice en vez de dibujar una línea vacía.
 */
export default function TrackSchematicModal({schematic, onClose}) {
    const normalized = useMemo(() => normalizeSchematic(schematic), [schematic])
    return (
        <Modal opened onClose={onClose} size="min(96vw, 110rem)" title={schematicTitle(normalized)}>
            <Stack>
                <Text size="sm">{schematicSummary(normalized)}</Text>
                {normalized.profiles.length === 0
                    ? <Text>Esta vía no tiene perfiles: no hay nada que dibujar.</Text>
                    : (
                        <>
                            <ScrollArea type="auto" offsetScrollbars>
                                <Box bg="white" w="fit-content">
                                    <SchematicSvg schematic={normalized}/>
                                </Box>
                            </ScrollArea>
                            <Text size="xs" c="dimmed">{LEGEND}</Text>
                        </>
                    )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Cerrar</Button>
                </Group>
            </Stack>
        </Modal>
    )
}
