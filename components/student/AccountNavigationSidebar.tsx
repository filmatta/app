import AppNavigationSidebar, {
  WorkspaceNavigationGroup,
  WorkspaceNavigationLink,
} from "./AppNavigationSidebar";

export default function AccountNavigationSidebar() {
  return (
    <AppNavigationSidebar currentArea="account">
      <WorkspaceNavigationGroup label="Tu espacio"><WorkspaceNavigationLink href="/cuenta">Cuenta</WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#mis-cursos">
          Mis cursos
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#actividad">
          Tu actividad
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#perfil">
          Datos personales
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#avatar">
          Avatar
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#pagos">
          Pagos
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#metodos-pago">
          Métodos de pago
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#facturacion">
          Facturación
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#configuracion">
          Configuración
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta/configuracion#seguridad">
          Seguridad
        </WorkspaceNavigationLink>
      </WorkspaceNavigationGroup>
    </AppNavigationSidebar>
  );
}
