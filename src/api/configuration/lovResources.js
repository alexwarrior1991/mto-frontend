/**
 * Los 17 catalogos (listas de valores) de mto-configuration. Comparten controlador base y DTO, asi
 * que son una sola pantalla con el recurso en la ruta (catalogos/:resource). Copiado de
 * LovResource.java del backoffice: un catalogo nuevo en el servicio es una entrada mas aqui.
 *
 * Tres dependen de otro catalogo y el servicio exige ese tipo al dar de alta y al modificar
 * (README_API.md §5 de mto-configuration): parent dice en que campo viaja, de que catalogo sale y
 * como se llama en pantalla.
 */
export const LOV_RESOURCES = Object.freeze([
    {path: 'anchorages', title: 'Anclajes'},
    {
        path: 'anchorage-foundations',
        title: 'Cimentaciones de anclaje',
        parent: {field: 'anchorageFoundationType', path: 'anchorage-foundation-types', label: 'Tipo de cimentación de anclaje'},
    },
    {path: 'anchorage-foundation-types', title: 'Tipos de cimentación de anclaje'},
    {path: 'assembly-configurations', title: 'Configuraciones de montaje'},
    {path: 'cantilever-types', title: 'Tipos de ménsula'},
    {path: 'comercial-entity-types', title: 'Tipos de entidad comercial'},
    {path: 'disconnector-functions', title: 'Funciones de seccionador'},
    {
        path: 'foundations',
        title: 'Cimentaciones',
        parent: {field: 'foundationType', path: 'foundation-types', label: 'Tipo de cimentación'},
    },
    {path: 'foundation-types', title: 'Tipos de cimentación'},
    {path: 'pole-types', title: 'Tipos de poste'},
    {
        path: 'portals',
        title: 'Pórticos',
        parent: {field: 'portalType', path: 'portal-types', label: 'Tipo de pórtico'},
    },
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
