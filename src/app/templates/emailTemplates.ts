export const emailShell = (
  heading: string,
  body: string,
  actionLabel?: string,
  actionUrl?: string,
) => ({
  text: `${heading}\n\n${body}${actionUrl ? `\n\n${actionLabel}: ${actionUrl}` : ""}`,
  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#18212f"><h1>${heading}</h1><p>${body}</p>${actionUrl ? `<p><a href="${actionUrl}" style="background:#1769aa;color:white;padding:12px 18px;text-decoration:none;border-radius:6px">${actionLabel}</a></p>` : ""}<p>If you did not request this, contact support immediately.</p></body></html>`,
});

export const adminWelcomeTemplate = (temporaryPassword: string, loginUrl: string) => ({
  text: `Your administrator account is ready. Temporary password: ${temporaryPassword}. Change it after signing in: ${loginUrl}`,
  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#18212f"><h1>Your administrator account is ready</h1><p>Your temporary password is: ${temporaryPassword}</p><p>You must change it after signing in.</p><p><a href="${loginUrl}">Activate account and sign in</a></p></body></html>`,
});
