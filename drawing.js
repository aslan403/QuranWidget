// Geometry shared by both native Cairo renderers. Coordinates are caller-owned.
export function roundedRectangle(cr, x, y, width, height, radius) {
    const requested = Number.isFinite(radius) ? radius : 24;
    const r = Math.max(0, Math.min(requested, width / 2, height / 2));
    cr.newPath();
    if (r === 0) {
        cr.rectangle(x, y, width, height);
        return;
    }
    cr.newSubPath();
    cr.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    cr.closePath();
}
