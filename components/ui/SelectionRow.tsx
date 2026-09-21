import type { InputHTMLAttributes, ReactNode } from "react";
export default function SelectionRow({ children, type = "checkbox", ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & { children: ReactNode; type?: "checkbox" | "radio" }) {
  return <label className="selection-row"><input {...input} type={type} /><span className="selection-row-label">{children}</span><span className="selection-row-check" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 10 4 4 8-8" /></svg></span></label>;
}
