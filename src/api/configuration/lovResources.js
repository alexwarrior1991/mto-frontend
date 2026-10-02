/**
 * Los 17 catalogos (listas de valores) de mto-configuration. Comparten controlador base y DTO, asi
 * que son una sola pantalla con el recurso en la ruta (catalogos/:resource). Copiado de
 * LovResource.java del backoffice: un catalogo nuevo en el servicio es una entrada mas aqui.
 */
export const LOV_RESOURCES = Object.freeze([
    {path: 'anchorages', title: 'Anclajes'},
    {path: 'anchorage-foundations', title: 'Cimentaciones de anclaje'},
    {path: 'anchorage-foundation-types', title: 'Tipos de cimentación de anclaje'},
    {path: 'assembly-configurations', title: 'Configuraciones de montaje'},
    {path: 'cantilever-types', title: 'Tipos de ménsula'},
    {path: 'comercial-entity-types', title: 'Tipos de entidad comercial'},
    {path: 'disconnector-functions', title: 'Funciones de seccionador'},
    {path: 'foundations', title: 'Cimentaciones'},
    {path: 'foundation-types', title: 'Tipos de cimentación'},
    {path: 'pole-types', title: 'Tipos de poste'},
    {path: 'portals', title: 'Pórticos'},
    {path: 'portal-types', title: 'Tipos de pórtico'},
    {path: 'profile-statuses', title: 'Estados de perfil'},
    {path: 'return-supports', title: 'Soportes de retorno'},
    {path: 'sectionings', title: 'Seccionamientos'},
    {path: 'steady-arm-types', title: 'Tipos de brazo de atirantado'},
    {path: 'support-types', title: 'Tipos de soporte'},
])

export function findLovResource(path) {
    return LOV_RESOURCES.find((resource) => resource.path === path) ?? null
}
