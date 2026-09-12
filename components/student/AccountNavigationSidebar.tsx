import AppNavigationSidebar, {
  WorkspaceNavigationGroup,
  WorkspaceNavigationLink,
} from "./AppNavigationSidebar";

export default function AccountNavigationSidebar() {
  return (
    <AppNavigationSidebar currentArea="account">
      <WorkspaceNavigationGroup label="Tu espacio">
        <WorkspaceNavigationLink href="/cuenta#mis-cursos">
          Mis cursos
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#actividad">
          Tu actividad
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#perfil">
          Datos personales
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#avatar">
          Avatar
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#pagos">
          Pagos
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#metodos-pago">
          Métodos de pago
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#facturacion">
          Facturación
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#configuracion">
          Configuración
        </WorkspaceNavigationLink>
        <WorkspaceNavigationLink href="/cuenta#seguridad">
          Seguridad
        </WorkspaceNavigationLink>
      </WorkspaceNavigationGroup>
    </AppNavigationSidebar>
  );
}
