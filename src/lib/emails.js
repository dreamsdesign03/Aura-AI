export const isPlaceholderEmail = (e) => !e || /^noemail\+.*@auralaser\.co\.in$/i.test(String(e).trim());

export const cleanEmail = (e) => (isPlaceholderEmail(e) ? "" : String(e).trim());
