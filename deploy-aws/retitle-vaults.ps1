#Requires -Version 7.0
<#
.SYNOPSIS
  Writes the stored title of every note into its content, before 0.6.0 goes up.

.DESCRIPTION
  Every note already written carries its title as an ATTRIBUTE of the note and
  nothing in its content, and every link in it was written to be found by a
  slug that folded case, accents and punctuation. The moment 0.6.0 is
  deployed, both facts turn into the same failure: notes with no addressable
  title, every wikilink pending, and a graph with no edges — a vault that looks
  emptied to whoever keeps it, with nothing on screen saying why.

  And the deploy destroys the information the repair needs: the title has to be
  written into the content FROM the stored title, and after the deploy there is
  no stored title. So the order is fixed, and it is the whole point of this
  script:

    1. this script, against the version IN PRODUCTION
    2. the deploy of 0.6.0
    3. ./deploy-aws/reproject-links.ps1

  This file signs in and hands the session over. The migration itself is
  `memorysmith-backend/apps/core-monolith/src/retitle.ts`, where the three
  transformations it performs — the retired slug rule, the frontmatter
  insertion and the link retargeting — are asserted against `noteTitle` and
  `extractLinks`, the two functions 0.6.0 will read the result with. A
  migration nobody can check is a migration nobody should run, and a
  PowerShell function is not something this repository's CI asserts.

  Everything is written through the product API, as the person who signs in
  here: nothing is written into DynamoDB or S3 by hand, so the revisions, the
  domain events and the audit trail are the ones the product would have
  produced.

  It reports first and writes only with -Apply, and a second run changes
  nothing.

.PARAMETER Apply
  Writes. Without it the script only reports what it would do.

.PARAMETER Email
  The account to sign in as. It migrates the vaults that account can write.

.PARAMETER ProfileName
  AWS profile to use. Defaults to the standard credential chain.

.PARAMETER Region
  Target region. Defaults to the profile's region, then to us-east-1.

.EXAMPLE
  ./deploy-aws/retitle-vaults.ps1 -Email somebody@example.com
  Reports what it would write, and changes nothing.

.EXAMPLE
  ./deploy-aws/retitle-vaults.ps1 -Email somebody@example.com -Apply
  Writes the titles and the retargeted links.
#>

[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$Email,
  [Alias('Profile')][string]$ProfileName,
  [string]$Region
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'lib' 'common.ps1')
. (Join-Path $PSScriptRoot 'lib' 'api.ps1')

Write-Host ''
Write-Host 'MemorySmith - write the stored title into every note'

Set-AwsContext -Region $Region -ProfileName $ProfileName

$caller = Invoke-Aws -AllowFailure -Arguments @('sts', 'get-caller-identity')
if ($null -eq $caller) {
  Write-Gap 'AWS credentials: no usable credentials for this profile'
  exit 1
}
Write-Ok "AWS credentials       account $($caller.Account)"

$context = Get-CdkContext
$zoneName = $context.hostedZoneName
Set-ApiOrigin -Origin "https://api.$zoneName"

$outputs = Get-StackOutputs -StackName 'MemorysmithIdentity'
if (-not $outputs -or -not $outputs['UserPoolId'] -or -not $outputs['WebClientId']) {
  Write-Gap 'MemorysmithIdentity has no outputs; there is no environment to migrate.'
  exit 1
}
Write-Ok "API                   $(Get-ApiOrigin)"

Write-Step 'The account whose vaults are migrated'
if (-not $Email) { $Email = (Read-Host '  e-mail of the account').Trim() }
$password = [System.Net.NetworkCredential]::new(
  '', (Read-Host '  password' -AsSecureString)).Password

$token = Get-CognitoToken -UserPoolId $outputs['UserPoolId'] -ClientId $outputs['WebClientId'] `
  -Username $Email -Password $password -ZoneName $zoneName
Write-Ok "Signed in             $Email"

Write-Host ''
Write-Step (($Apply) ? 'Migrating and writing' : 'Migrating (report only)')

$entry = Join-Path $PSScriptRoot '..' 'memorysmith-backend' 'apps' 'core-monolith' 'src' 'retitle.ts'
$arguments = @('tsx', $entry)
if ($Apply) { $arguments += '--apply' }

# The token travels to the child process in the environment, the way the
# profile does for the recount: it lives for an hour, it never reaches disk,
# and the alternative — a command line — would put it in the process table.
$env:API_ORIGIN = Get-ApiOrigin
$env:ACCESS_TOKEN = $token

try {
  pnpm @arguments
  $code = $LASTEXITCODE
}
finally {
  $env:ACCESS_TOKEN = ''
}

Write-Host ''
if ($code -ne 0) {
  Write-Gap "retitle: the job exited with $code"
  exit $code
}
if (-not $Apply) {
  Write-Ok 'report only: run again with -Apply when the report reads right'
}
else {
  Write-Ok 'the vaults state their titles. Deploy 0.6.0 next, then reproject-links.ps1'
}
