# Signing in and calling the product API, for the scripts that operate an
# environment through it rather than behind it.
#
# Everything here goes through the API on purpose: a script that wrote into
# DynamoDB or S3 by hand would produce a vault with no revisions, no domain
# events and no audit trail — the three things that make a write of this
# product a write of this product. The cost is one HTTP call per note, and it
# is the right cost.

$script:ApiOrigin = ''

function Set-ApiOrigin {
  param([Parameter(Mandatory)][string]$Origin)
  $script:ApiOrigin = $Origin
}

function Get-ApiOrigin {
  return $script:ApiOrigin
}

function Get-CognitoToken {
  <#
    The admin sign-in flow, not the hosted UI: it needs IAM permission on the
    pool, so it grants nothing to whoever holds only the password.
  #>
  param(
    [Parameter(Mandatory)][string]$UserPoolId,
    [Parameter(Mandatory)][string]$ClientId,
    [Parameter(Mandatory)][string]$Username,
    [Parameter(Mandatory)][string]$Password,
    [string]$ZoneName
  )
  # The parameters go as JSON, not as the key=value shorthand: a password is
  # allowed to carry a comma or an equals sign, and the shorthand parser would
  # read either one as the start of another parameter.
  $parameters = @{ USERNAME = $Username; PASSWORD = $Password } | ConvertTo-Json -Compress
  $auth = Invoke-Aws -AllowFailure -Arguments @(
    'cognito-idp', 'admin-initiate-auth',
    '--user-pool-id', $UserPoolId,
    '--client-id', $ClientId,
    '--auth-flow', 'ADMIN_USER_PASSWORD_AUTH',
    '--auth-parameters', $parameters
  )
  if (-not $auth) {
    throw "Could not sign in as $Username. Wrong password, or the account is not confirmed."
  }
  if ($auth.ChallengeName) {
    $where = if ($ZoneName) { " at https://auth.$ZoneName" } else { '' }
    throw "Cognito answered with the challenge '$($auth.ChallengeName)'. Finish it on the sign-in page$where and run this again."
  }
  $token = $auth.AuthenticationResult.AccessToken
  if (-not $token) { throw 'Sign-in returned no access token.' }
  return $token
}

function Invoke-Api {
  <#
    One call to the product API. Returns the parsed body, or $null for an empty
    one, and throws with the API's own error payload.
  #>
  param(
    [Parameter(Mandatory)][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Token,
    [object]$Body
  )
  $arguments = @{
    Uri                = "$script:ApiOrigin$Path"
    Method             = $Method
    Headers            = @{ Authorization = "Bearer $Token" }
    SkipHttpErrorCheck = $true
    TimeoutSec         = 60
  }
  if ($null -ne $Body) {
    # Sent as UTF-8 bytes, because a note carries accents and an agent
    # that reads it back must find the same characters that were written.
    $json = $Body | ConvertTo-Json -Compress -Depth 10
    $arguments['Body'] = [System.Text.Encoding]::UTF8.GetBytes($json)
    $arguments['ContentType'] = 'application/json; charset=utf-8'
  }
  <#
    A vault of six hundred notes is six hundred calls, and a single throttle or
    one bad gateway in the middle of it would throw the whole run away. Only
    429 and 5xx are retried: a 4xx is an answer, and repeating it would just
    ask the same wrong question again.
  #>
  for ($attempt = 1; ; $attempt++) {
    $response = Invoke-WebRequest @arguments
    if ($response.StatusCode -lt 400) { break }
    $retriable = $response.StatusCode -eq 429 -or $response.StatusCode -ge 500
    if (-not $retriable -or $attempt -ge 4) {
      throw "$Method $Path answered $($response.StatusCode): $($response.Content)"
    }
    Write-Warn "$Method $Path answered $($response.StatusCode); retrying ($attempt of 3)"
    Start-Sleep -Seconds ([Math]::Pow(2, $attempt))
  }
  if (-not $response.Content) { return $null }
  return ($response.Content | ConvertFrom-Json)
}
