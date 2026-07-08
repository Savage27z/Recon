export function PageHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
      <div>
        <div className="text-[13px] text-muted font-bold mb-1">{label}</div>
        <h1 className="text-[22px] md:text-[26px] font-extrabold tracking-tight m-0">{title}</h1>
      </div>
      <a
        href="/"
        className="font-bold text-[13.5px] text-muted border border-border bg-card px-4 py-[10px] rounded-[10px]"
      >
        ← Back to site
      </a>
    </div>
  );
}
