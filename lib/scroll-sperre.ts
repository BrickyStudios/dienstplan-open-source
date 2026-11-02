type Vorzustand = {
    overflow: string;
    paddingRight: string;
};
export function scrollSperren(): () => void {
    const wurzel = document.documentElement;
    const vorher: Vorzustand = {
        overflow: wurzel.style.overflow,
        paddingRight: wurzel.style.paddingRight,
    };
    const balken = window.innerWidth - wurzel.clientWidth;
    wurzel.style.overflow = "hidden";
    if (balken > 0)
        wurzel.style.paddingRight = `${balken}px`;
    return () => {
        wurzel.style.overflow = vorher.overflow;
        wurzel.style.paddingRight = vorher.paddingRight;
    };
}
