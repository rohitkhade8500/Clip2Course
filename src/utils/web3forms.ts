// ============================================================
// Web3Forms Configuration
// ============================================================
// 🔑 HOW TO GET YOUR ACCESS KEY:
//   1. Go to https://web3forms.com
//   2. Enter your email: founder@clip2course.online
//   3. Check your inbox and copy the access key
//   4. Paste it below replacing the placeholder
// ============================================================

const WEB3FORMS_ACCESS_KEY = '54082be8-9297-4c73-b257-62256f0ae6aa'

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit'

interface Web3FormsPayload {
  [key: string]: string
}

interface Web3FormsResponse {
  success: boolean
  message: string
}

/**
 * Submit form data to Web3Forms API.
 * All submissions are delivered to the email associated with the access key.
 */
export async function submitToWeb3Forms(
  data: Web3FormsPayload
): Promise<Web3FormsResponse> {
  const payload = {
    access_key: WEB3FORMS_ACCESS_KEY,
    ...data,
  }

  const response = await fetch(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })

  const result: Web3FormsResponse = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Something went wrong. Please try again.')
  }

  return result
}
