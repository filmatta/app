"use client";
import { useEffect, useState } from "react";
export default function FeedbackToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setVisible(false), 6500); return () => clearTimeout(timer); }, []);
  return visible ? <div className="filmatta-toast" role="status"><span aria-hidden="true">✓</span>{message}<button type="button" aria-label="Cerrar aviso" onClick={() => setVisible(false)}>×</button></div> : null;
}
