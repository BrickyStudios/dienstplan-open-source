export default function Schalter({ an, onClick, disabled = false, name, }: {
    an: boolean;
    onClick: () => void;
    disabled?: boolean;
    name?: string;
}) {
    return (<button type="button" role="switch" aria-checked={an} aria-label={name} disabled={disabled} onClick={onClick} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-default ${an ? "bg-[var(--akzent)]" : "bg-[var(--tinte-leise)]"}`}>
      <span aria-hidden="true" className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--papier)] rounded-full transition-transform ${an ? "translate-x-5" : ""}`}/>
    </button>);
}
