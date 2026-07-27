import { createContext, useContext } from "react";
/**
 * Returns true when the user can access the platform.
 * - Real email users: only need email verified (phone is optional).
 * - Phone-OTP users (synthetic email): must add + verify a real email first.
 */
export function isFullyVerified(user) {
    if (!user)
        return false;
    const synthetic = user.email?.endsWith("@otp.mysa.internal");
    if (synthetic)
        return false; // phone users must add a real email before getting access
    return !!(user.isVerified);
}
const noop = async () => { };
const noopUpdate = () => { };
export const AuthContext = createContext({
    user: null,
    refreshUser: noop,
    updateUser: noopUpdate,
});
export function useAuthUser() {
    return useContext(AuthContext).user;
}
export function useRefreshUser() {
    return useContext(AuthContext).refreshUser;
}
export function useUpdateUser() {
    return useContext(AuthContext).updateUser;
}
export const ADMIN_EMAIL = "admin@aurai.clinic";
export function useIsAdmin() {
    const user = useAuthUser();
    return user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
export function getUserInitials(user) {
    if (!user)
        return "?";
    const first = user.firstName?.trim();
    const last = user.lastName?.trim();
    if (first && last)
        return `${first[0]}${last[0]}`.toUpperCase();
    if (first)
        return first.slice(0, 2).toUpperCase();
    if (user.email)
        return user.email.slice(0, 2).toUpperCase();
    return "?";
}
