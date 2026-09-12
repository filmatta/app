import StudentNavigationDrawer from "./StudentNavigationDrawer";

export default function AuthenticatedWorkspaceLayout({
  navigation,
  context,
  intro,
  drawerLabel = "Navegación",
  children,
}: {
  navigation?: React.ReactNode | null;
  context?: React.ReactNode | null;
  intro?: React.ReactNode | null;
  drawerLabel?: string;
  children: React.ReactNode;
}) {
  if (!navigation) {
    return <main>{children}</main>;
  }

  return (
    <div
      className={`grid w-full max-w-none items-start gap-6 px-4 pb-20 pt-7 sm:px-6 min-[1024px]:max-[1099px]:px-8 min-[1100px]:pb-4 ${
        context
          ? "min-[1100px]:grid-cols-[14rem_minmax(0,1fr)_16rem] min-[1100px]:gap-5 min-[1280px]:grid-cols-[15rem_minmax(0,1fr)_17.5rem] min-[1280px]:gap-6 min-[1440px]:grid-cols-[17.5rem_minmax(0,1fr)_20rem] min-[1600px]:grid-cols-[18.75rem_minmax(0,1fr)_22rem]"
          : "min-[1100px]:grid-cols-[14rem_minmax(0,1fr)] min-[1100px]:gap-6 min-[1280px]:grid-cols-[15rem_minmax(0,1fr)] min-[1440px]:grid-cols-[17.5rem_minmax(0,1fr)] min-[1600px]:grid-cols-[18.75rem_minmax(0,1fr)]"
      }`}
    >
      <aside
        className="hidden min-[1100px]:sticky min-[1100px]:top-20 min-[1100px]:col-start-1 min-[1100px]:row-start-1 min-[1100px]:block min-[1100px]:h-[calc(100dvh-6rem)] min-[1100px]:overflow-x-hidden min-[1100px]:overflow-y-auto min-[1100px]:overscroll-contain min-[1100px]:pr-1 min-[1100px]:[scrollbar-color:rgba(255,255,255,0.16)_transparent] min-[1100px]:[scrollbar-gutter:stable] min-[1100px]:[scrollbar-width:thin]"
      >
        {navigation}
      </aside>
      <div className="contents min-[1100px]:col-span-2 min-[1100px]:col-start-2 min-[1100px]:row-start-1 min-[1100px]:grid min-[1100px]:grid-cols-subgrid min-[1100px]:items-start min-[1100px]:gap-y-5 min-[1280px]:gap-y-6">
        {intro && (
          <div className="min-w-0 min-[1100px]:col-start-1 min-[1100px]:row-start-1">
            <StudentNavigationDrawer label={drawerLabel}>
              {navigation}
            </StudentNavigationDrawer>
            {intro}
          </div>
        )}
        <main
          className={`min-w-0 min-[1100px]:col-start-1 ${
            intro ? "min-[1100px]:row-start-2" : "min-[1100px]:row-start-1"
          }`}
        >
          {!intro && (
            <StudentNavigationDrawer label={drawerLabel}>
              {navigation}
            </StudentNavigationDrawer>
          )}
          {children}
        </main>
        {context && (
          <aside className="mt-8 min-w-0 min-[1100px]:col-start-2 min-[1100px]:row-span-2 min-[1100px]:row-start-1 min-[1100px]:grid min-[1100px]:grid-rows-subgrid min-[1100px]:self-stretch min-[1100px]:mt-0">
            <div className="min-[1100px]:sticky min-[1100px]:top-20 min-[1100px]:row-start-2 min-[1100px]:max-h-[calc(100dvh-6rem)] min-[1100px]:overflow-y-auto min-[1100px]:overscroll-contain min-[1100px]:pr-1 min-[1100px]:[scrollbar-color:rgba(255,255,255,0.16)_transparent] min-[1100px]:[scrollbar-gutter:stable] min-[1100px]:[scrollbar-width:thin]">
              {context}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
