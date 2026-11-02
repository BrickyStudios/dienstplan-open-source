type Props = {
    className?: string;
    akzent?: string;
};
export default function Wortmarke({ className = "", akzent = "text-[var(--marke)]" }: Props) {
    return (<span className={className}>
      Nurv<span className={akzent}>o</span>
    </span>);
}
