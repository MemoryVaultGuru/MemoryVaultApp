#Requires -Version 7.0
<#
.SYNOPSIS
  Rebuilds the link graph of every vault, after 0.6.0 is deployed.

.DESCRIPTION
  The link projection is derived and rebuildable from zero (PE5), and the one
  in the table was built by the rule that 0.6.0 retired: a link used to resolve
  against a slug that folded case, accents and punctuation, and it now resolves
  against the title a note states, exactly, and against the aliases it declares.
  Every edge sitting in the table is an assertion the current rule never made.

  So it is not repaired, it is rebuilt: the edges are forgotten, what each vault
  answers to is restated from the notes themselves, and the ordinary write path
  resolves every target again. An edge then exists because the current rule says
  so, and not because an old projection said so.

  This is the THIRD step of three, and the order is not negotiable:

    1. ./deploy-aws/retitle-vaults.ps1, against the version in production
    2. the deploy of 0.6.0
    3. this script

  THE CHECK AFTER A RUN IS NOT EQUALITY. A note carrying `aliases:` starts
  answering targets that no title matched (RN-DSC-052), which under the retired
  rule resolved to nothing at all. So the expectation is that NO EDGE IS LOST,
  and that every edge gained is one an alias or a title explains — both of which
  the report names, edge by edge. A lost edge means step 1 did not do its job on
  some note, and the script exits with 2 so a release runner notices.

  It reports first and writes only with -Apply.

.PARAMETER Apply
  Rebuilds the graphs. Without it the script only reports the difference.

.PARAMETER ProfileName
  AWS profile to use. Defaults to the standard credential chain.

.PARAMETER Region
  Target region. Defaults to the profile's region, then to us-east-1.

.EXAMPLE
  ./deploy-aws/reproject-links.ps1
  Reports what the current rule finds, and changes nothing.

.EXAMPLE
  ./deploy-aws/reproject-links.ps1 -Apply
  Rebuilds the link projection of every vault.
#>

[CmdletBinding()]
param(
  [switch]$Apply,
  [Alias('Profile')][string]$ProfileName,
  [string]$Region
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'lib' 'common.ps1')

Write-Host ''
Write-Host 'MemorySmith - rebuild the link graph'

Set-AwsContext -Region $Region -ProfileName $ProfileName

$caller = Invoke-Aws -AllowFailure -Arguments @('sts', 'get-caller-identity')
if ($null -eq $caller) {
  Write-Gap 'AWS credentials: no usable credentials for this profile'
  exit 1
}
Write-Ok "AWS credentials       account $($caller.Account)"

# The resources are found by their logical id in the data stack, not by a
# hardcoded name: the name is an implementation detail of the stack.
function Get-DataResource {
  param([Parameter(Mandatory)][string]$LogicalPrefix)
  $found = Invoke-Aws -AllowFailure -Arguments @(
    'cloudformation', 'describe-stack-resources',
    '--stack-name', 'MemorysmithData',
    '--query', "StackResources[?starts_with(LogicalResourceId, '$LogicalPrefix')].PhysicalResourceId"
  )
  return @($found)[0]
}

$knowledgeTable = Get-DataResource -LogicalPrefix 'KnowledgeTable'
$discoveryTable = Get-DataResource -LogicalPrefix 'DiscoveryTable'
$bucket = Get-DataResource -LogicalPrefix 'ContentBucket'
if (-not $knowledgeTable -or -not $discoveryTable -or -not $bucket) {
  Write-Gap 'MemorysmithData does not expose the two tables and the content bucket'
  exit 1
}
Write-Ok "Knowledge table       $knowledgeTable"
Write-Ok "Discovery table       $discoveryTable"
Write-Ok "Content bucket        $bucket"

$entry = Join-Path $PSScriptRoot '..' 'memorysmith-backend' 'apps' 'core-monolith' 'src' 'reproject.ts'
$arguments = @('tsx', $entry)
if ($Apply) { $arguments += '--apply' }

Write-Host ''
Write-Step (($Apply) ? 'Rebuilding' : 'Comparing (report only)')

$env:KNOWLEDGE_TABLE = $knowledgeTable
$env:DISCOVERY_TABLE = $discoveryTable
$env:CONTENT_BUCKET = $bucket
if ($Global:MsAws.Profile) { $env:AWS_PROFILE = $Global:MsAws.Profile }
if ($Global:MsAws.Region) { $env:AWS_REGION = $Global:MsAws.Region }

pnpm @arguments
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 2) {
  Write-Gap 'some edges were lost: a note the retitling migration did not reach'
  exit 2
}
if ($code -ne 0) {
  Write-Gap "reproject: the job exited with $code"
  exit $code
}
if (-not $Apply) {
  Write-Ok 'report only: run again with -Apply to rebuild these graphs'
}
else {
  Write-Ok 'the graphs answer to the current rule'
}
