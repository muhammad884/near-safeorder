export const payLink = (id: number) => `${window.location.origin}/?pay=${id}`;
export const whatsappLink = (id: number, text: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${payLink(id)}`)}`;
