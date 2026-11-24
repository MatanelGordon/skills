// Display helpers for the account page.

export function formatName(user) {
  const first = user.firstName.trim();
  const last = user.lastName.trim();
  return `${first} ${last}`.trim();
}

export function initials(user) {
  return formatName(user)
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
