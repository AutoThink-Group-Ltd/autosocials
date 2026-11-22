interface DefaultSigData {
  fullName?: string;
  jobTitle?: string;
  phone?: string;
  address?: string;
  bookingLink?: string;
  logoUrl?: string;
  avatarUrl?: string;
}

function generateInitialsAvatar(name: string): string {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="32" fill="#6366f1"/>
      <text x="32" y="38" text-anchor="middle" fill="white" font-size="22" font-family="Arial,sans-serif" font-weight="600">${initials}</text>
    </svg>`
  )}`;
}

export function generateDefaultSignatureHtml(data: DefaultSigData): string {
  const name = data.fullName || "";
  const photoSrc = data.avatarUrl || data.logoUrl || generateInitialsAvatar(name || "AS");

  const rows: string[] = [];

  if (name) {
    rows.push(`<tr><td style="padding:0 0 2px 0;"><strong style="font-size:14px;color:#1a1a2e;">${name}</strong></td></tr>`);
  }
  if (data.jobTitle) {
    rows.push(`<tr><td style="padding:0 0 8px 0;font-size:12px;color:#6b7280;">${data.jobTitle}</td></tr>`);
  }

  rows.push(`<tr><td style="padding:4px 0;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" /></td></tr>`);

  const contacts: string[] = [];
  if (data.phone) contacts.push(`📞 ${data.phone}`);
  if (data.address) contacts.push(`📍 ${data.address}`);
  if (data.bookingLink) {
    const url = data.bookingLink.startsWith("http") ? data.bookingLink : `https://${data.bookingLink}`;
    contacts.push(`📅 <a href="${url}" style="color:#6366f1;text-decoration:none;">Book a call</a>`);
  }

  contacts.forEach((line) => {
    rows.push(`<tr><td style="padding:2px 0;font-size:12px;color:#374151;">${line}</td></tr>`);
  });

  return `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;max-width:400px;">
  <tr>
    <td style="padding-right:12px;vertical-align:top;">
      <img src="${photoSrc}" width="64" height="64" style="border-radius:50%;display:block;" alt="" />
    </td>
    <td style="vertical-align:top;">
      <table cellpadding="0" cellspacing="0">${rows.join("")}</table>
    </td>
  </tr>
</table>`;
}
