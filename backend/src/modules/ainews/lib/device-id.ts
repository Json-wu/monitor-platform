export function isDeviceId(s: string): boolean {
  return /^dev_[a-f0-9]{32}$/.test(s)
}
