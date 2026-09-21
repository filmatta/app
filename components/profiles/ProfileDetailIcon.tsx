export default function ProfileDetailIcon({ kind }: { kind: "formats" | "themes" | "participation" | "conditions" | "skills" | "equipment" }) {
  const paths = {
    formats: "M3 6h18v14H3z M3 6l3-3h15l-3 3 M8 3l-3 3 M14 3l-3 3 M9 11l6 3-6 3z",
    themes: "M4 4h6a3 3 0 013 3v14a5 5 0 00-5-2H4z M13 7a3 3 0 013-3h5v15h-4a5 5 0 00-4 2",
    participation: "M8 7a4 4 0 108 0 4 4 0 00-8 0 M4 21v-3a8 8 0 0116 0v3",
    conditions: "M8 7V4h8v3 M3 7h18v14H3z M3 12h18 M10 12v3h4v-3",
    skills: "M12 3l2.5 5.5L21 9l-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 9l6.5-.5z",
    equipment: "M3 7h4l2-3h6l2 3h4v14H3z M8 14a4 4 0 108 0 4 4 0 00-8 0",
  };
  return <svg className="p2-detail-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>;
}
