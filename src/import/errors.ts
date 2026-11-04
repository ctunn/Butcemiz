export class PdfPasswordError extends Error {
  constructor(public wrong: boolean) { super(wrong ? 'wrong-password' : 'password-required'); }
}
