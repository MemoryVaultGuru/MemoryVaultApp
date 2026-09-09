#Requires -Version 7.0
<#
.SYNOPSIS
  Creates an account, gives it a subscription and fills its first vault.

.DESCRIPTION
  A deploy seeds nothing: the user pool comes up empty and no subscription is
  written behind the rule that a person asks for one and a platform admin
  approves it (RN-SUB-001, RN-SUB-006). On a brand new environment that leaves
  nobody to sign in as, and nobody who could approve anything either.

  This script closes that loop end to end, and never by hand: it creates the
  account in Cognito, signs in as it, asks for the subscription with the type
  and the quota that were chosen, puts it in the status that was chosen, and
  then writes a whole vault through the product API, from a vault tree under
  deploy-aws/vaults. Nothing is written into DynamoDB or S3
  directly, so the domain events and the audit trail are the ones the product
  would have produced.

  THE FIRST ACCOUNT OF AN EMPTY POOL BECOMES A PLATFORM ADMIN, and only the
  first: somebody has to be able to authorize the very first subscription. Once
  the group has a member, a later run asks for the credentials of an existing
  admin instead of quietly handing out the platform to whoever runs it.

  THE ACCOUNT IS HANDED OVER WITH A PROVISIONAL PASSWORD. Asking for the
  subscription and writing the vault are done as the account, so the script
  needs to sign in as it, and it signs in with a password of its own that
  nobody ever sees. At the end it leaves the account waiting for its first
  password: Cognito e-mails an invitation with a temporary one, and the
  sign-in page asks for a password of their own the first time it is used.
  Whoever runs this never learns the password of somebody else's account.
  -SetPassword types a permanent password here instead, and sends no e-mail.

  The subscription claim is minted when the token is, so the browser only sees
  the subscription after a NEW sign-in: sign out and back in once this finishes.

.PARAMETER Email
  The account to create or reuse. Asked for when it is not given.

.PARAMETER Name
  Display name of the account. The e-mail is used when there is none.

.PARAMETER Type
  Subscription type. Only 'individual' exists in this phase (RN-SUB-018).

.PARAMETER Quota
  Storage quota: '500MB', '1GB' or '2GB'. Declared, not enforced (RN-SUB-019).

.PARAMETER Status
  The status the subscription ends in. Any of the six, including one the
  transition machine would refuse: the platform route that sets it is the
  administrative override, and this is what it exists for (RN-SUB-018).

.PARAMETER VaultTemplate
  Slug of the vault to write, or 'none' for an account with no vault. Asked
  for when it is not given; the list is what exists under deploy-aws/vaults.

.PARAMETER VaultName
  Name of the created vault. Defaults to the title of the source vault.

.PARAMETER StructureOnly
  Writes the Guidance, the folders and the Templates, and no notes. Useful on a
  large vault, where the notes are the slow part by far.

.PARAMETER MaxNotes
  Stops after this many notes. 0, the default, means every note of the vault.

.PARAMETER PreviewVault
  Prints the vault that WOULD be written, folder by folder, and stops. It
  creates nothing and calls neither the API nor Cognito, so it is how a vault
  of six hundred notes is inspected before it is uploaded.

.PARAMETER SetPassword
  Sets a permanent password, typed here, instead of handing the account over
  with a provisional one. No invitation is sent. It exists for the first
  account of a new environment, which is the one that cannot afford to depend
  on an e-mail arriving, and for an account whose owner is whoever runs this.

.PARAMETER Region
  Target region. Defaults to CDK_DEFAULT_REGION, then to the region of the AWS
  profile, then to us-east-1.

.PARAMETER ProfileName
  AWS profile to use. Defaults to the standard credential chain.

.EXAMPLE
  ./deploy-aws/onboard.ps1 -Profile memorysmith
  Asks for everything it needs and creates the account, the subscription and
  the vault.

.EXAMPLE
  ./deploy-aws/onboard.ps1 -VaultTemplate engineering-knowledge -PreviewVault
  Prints what that vault would become, and changes nothing.

.EXAMPLE
  ./deploy-aws/onboard.ps1 -Email ana@example.com -Quota 2GB -Status active -VaultTemplate fermentacao
  A subscription of 2 GB, active, with a small vault written into it. Ana gets
  an e-mail with a provisional password and chooses her own on the first
  sign-in; nobody else ever knows it.

.EXAMPLE
  ./deploy-aws/onboard.ps1 -Email me@example.com -SetPassword
  The account of whoever runs this, with a password typed here and no e-mail.
#>

[CmdletBinding()]
param(
  [string]$Email,
  [string]$Name,
  [ValidateSet('individual')][string]$Type = 'individual',
  [ValidateSet('500MB', '1GB', '2GB')][string]$Quota,
  [ValidateSet('pending_approval', 'trial', 'active', 'rejected', 'suspended', 'canceled')]
  [string]$Status,
  [string]$VaultTemplate,
  [string]$VaultName,
  [switch]$StructureOnly,
  [int]$MaxNotes = 0,
  [switch]$PreviewVault,
  [switch]$SetPassword,
  [string]$Region,
  [Alias('Profile')][string]$ProfileName
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'lib' 'common.ps1')

Write-Host ''
Write-Host 'MemorySmith - onboard an account' -ForegroundColor White

$script:ApiOrigin = ''
$script:FolderCount = 0
$script:NoteCount = 0
$script:SkippedNotes = 0
$script:RepairedTitles = 0

# --- Helpers -----------------------------------------------------------------

function Read-Choice {
  <#
    A numbered menu with a default. Enter takes the default, which is what
    makes a scripted run and an interactive one end in the same place.
  #>
  param(
    [Parameter(Mandatory)][string]$Title,
    [Parameter(Mandatory)][string[]]$Options,
    [Parameter(Mandatory)][string]$Default,
    [string[]]$Labels
  )
  Write-Host ''
  Write-Host "  $Title"
  for ($index = 0; $index -lt $Options.Count; $index++) {
    $suffix = if ($Options[$index] -eq $Default) { ' (default)' } else { '' }
    $label = if ($Labels -and $Labels[$index]) { "  $($Labels[$index])" } else { '' }
    Write-Host ("    {0}) {1}{2}{3}" -f ($index + 1), $Options[$index], $suffix, $label)
  }
  while ($true) {
    $answer = (Read-Host '  choice').Trim()
    if (-not $answer) { return $Default }
    if ($answer -match '^\d+$') {
      $picked = [int]$answer
      if ($picked -ge 1 -and $picked -le $Options.Count) { return $Options[$picked - 1] }
    }
    $match = $Options | Where-Object { $_ -eq $answer }
    if ($match) { return $match }
    Write-Warn 'not one of the options'
  }
}

function Read-Secret {
  <# A password, asked twice when it is being set for the first time. #>
  param([Parameter(Mandatory)][string]$Prompt, [switch]$Confirm)
  while ($true) {
    $first = [System.Net.NetworkCredential]::new('', (Read-Host "  $Prompt" -AsSecureString)).Password
    if (-not $first) { Write-Warn 'empty password'; continue }
    if (-not $Confirm) { return $first }
    if ($first.Length -lt 12) {
      Write-Warn 'the pool asks for at least 12 characters, with a digit, a lowercase and an uppercase'
      continue
    }
    $again = [System.Net.NetworkCredential]::new('', (Read-Host '  repeat it' -AsSecureString)).Password
    if ($first -ne $again) { Write-Warn 'the two do not match'; continue }
    return $first
  }
}

function New-WorkingPassword {
  <#
    A password nobody is meant to keep: the script signs in with it while it
    runs and replaces it with a provisional one at the end. Letters and digits
    only, because it travels as a command-line argument, and long enough that
    the alphabet costs it nothing.
  #>
  $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  $lower = 'abcdefghijkmnopqrstuvwxyz'
  $digit = '23456789'
  $alphabet = $upper + $lower + $digit
  # One of each first, so the pool policy is met by construction and not by
  # luck, and then shuffled, so their positions say nothing.
  $characters = @(
    $upper[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($upper.Length)],
    $lower[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($lower.Length)],
    $digit[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($digit.Length)]
  )
  for ($index = 0; $index -lt 21; $index++) {
    $characters += $alphabet[
    [System.Security.Cryptography.RandomNumberGenerator]::GetInt32($alphabet.Length)]
  }
  return -join ($characters | Sort-Object {
      [System.Security.Cryptography.RandomNumberGenerator]::GetInt32([int]::MaxValue)
    })
}

function Send-Invitation {
  <#
    Leaves the account waiting for its first password and asks Cognito to
    e-mail the invitation that carries it.

    An invitation can only be sent to an account that has never set a password,
    so the temporary password below is what moves it into that state
    (FORCE_CHANGE_PASSWORD), and the send mints another one for the message
    itself. The one set here is therefore dead the moment the message leaves,
    and is returned only because a send that fails leaves it as the single way
    into the account.
  #>
  param(
    [Parameter(Mandatory)][string]$UserPoolId,
    [Parameter(Mandatory)][string]$Email
  )
  $temporary = New-WorkingPassword
  Invoke-Aws -Arguments @(
    'cognito-idp', 'admin-set-user-password',
    '--user-pool-id', $UserPoolId,
    '--username', $Email,
    '--password', $temporary,
    '--no-permanent'
  ) | Out-Null

  $sent = Invoke-Aws -AllowFailure -Arguments @(
    'cognito-idp', 'admin-create-user',
    '--user-pool-id', $UserPoolId,
    '--username', $Email,
    '--message-action', 'RESEND'
  )
  if ($sent) { return '' }
  return $temporary
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
    one bad gateway in the middle of it would throw the whole upload away. Only
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

function Get-VaultText {
  <# A file of the vault tree as text, always decoded as UTF-8. #>
  param([Parameter(Mandatory)][string]$Path)
  return [System.IO.File]::ReadAllText($Path, [System.Text.UTF8Encoding]::new($false))
}

function Add-StatedTitle {
  <#
    The title of a note is read from the note itself: `title:` in the
    frontmatter first, and the first level-1 heading when the frontmatter
    states none (RN-KNW-035). A vault tree that came from an editor keyed by
    file name carries that name nowhere inside the file, so a note that opens
    with a shorter heading - or with none at all - would arrive under a name
    nobody linked to, or with no addressable title at all (RN-KNW-036).

    So the file name is written into the frontmatter as `title:`, and only
    where the source states none. It is the same repair `build-vaults.mjs`
    applies to a committed tree and the migration applies to a live vault, and
    it never overwrites a title the author wrote.
  #>
  param([Parameter(Mandatory)][string]$Text, [Parameter(Mandatory)][string]$FileName)

  # The four characters that would leave the note unaddressable
  # (RN-KNW-036) come out of the file name, with the quotes that would
  # break the scalar. A repair that wrote an unaddressable title would be
  # no repair at all.
  $title = ($FileName -replace '[#\[\]|"\\]', '').Trim()
  if (-not $title) { $title = 'Nota' }
  $opens = $Text -match '^---\r?\n'
  if ($opens) {
    $end = [regex]::Match($Text, '^---\r?\n([\s\S]*?)\r?\n---')
    if ($end.Success) {
      $block = $end.Groups[1].Value
      # A `title:` with a value on the same line is a stated title; anything
      # else - absent, empty, a list - is not, and falls to the repair.
      if ($block -match '(?m)^title:[ \t]*\S') {
        return [pscustomobject]@{ Text = $Text; Repaired = $false }
      }
      $withoutTitle = ($block -split '\r?\n' | Where-Object { $_ -notmatch '(?m)^title:[ \t]*$' }) -join "`n"
      $rest = $Text.Substring($end.Length)
      $head = if ($withoutTitle.Trim()) { "title: $title`n$withoutTitle" } else { "title: $title" }
      return [pscustomobject]@{ Text = "---`n$head`n---$rest"; Repaired = $true }
    }
  }
  return [pscustomobject]@{ Text = "---`ntitle: $title`n---`n`n$Text"; Repaired = $true }
}

function Limit-Description {
  <#
    A description is MANDATORY and capped at 500 characters (RN-KNW-006): a
    longer one is cut rather than refused, and a folder the structure document
    leaves without one still gets a sentence.
  #>
  param([string]$Text, [Parameter(Mandatory)][string]$Title)
  $value = if ($Text) { $Text.Trim() } else { '' }
  if (-not $value) { $value = "Notas de $Title." }
  if ($value.Length -gt 500) { $value = $value.Substring(0, 497) + '...' }
  return $value
}

function Get-StructureTree {
  <#
    THE STRUCTURE OF A VAULT COMES FROM ITS STRUCTURE.md, NOT FROM THE
    DIRECTORIES. The description of a folder is an attribute of the folder and
    never a document, so the export writes every description once, at the vault
    root, and writes nothing inside the folder to carry it. A folder holding no
    template and no note leaves no directory behind at all, and only that
    document remembers it.

    One line per folder, numbered, which is what makes it readable without an
    index: `2.1.` is the folder numbered 1 inside the folder numbered 2, and
    those numbers are the numeric prefixes the directories carry. Each node
    comes back with the directory that holds its template and its notes, or
    with none when the folder has neither.

    Returns the root nodes, in order, each with its Children.
  #>
  param([Parameter(Mandatory)][string]$VaultRoot)

  $path = Join-Path $VaultRoot 'STRUCTURE.md'
  if (-not (Test-Path -LiteralPath $path)) { return @() }

  $roots = [System.Collections.ArrayList]::new()
  $byNumbering = @{}
  $dirByNumbering = @{ '' = $VaultRoot }

  foreach ($line in (Get-VaultText -Path $path) -split "`r?`n") {
    if ($line -notmatch '^\s*([\d.]+)\.\s+\*\*(.+?)/?\*\*:\s*(.*?)\s*(?:\(\d+\s+notes?[^()]*\))?\s*$') {
      continue
    }
    $numbering = $Matches[1]
    $title = $Matches[2]
    $description = $Matches[3]

    $parts = $numbering -split '\.'
    $parentKey = if ($parts.Count -eq 1) { '' } else { ($parts[0..($parts.Count - 2)] -join '.') }
    if (-not $dirByNumbering.ContainsKey($parentKey)) { continue }

    $parentDir = $dirByNumbering[$parentKey]
    $position = [int]$parts[-1]
    $directory = $null
    if ($parentDir) {
      $child = Get-ChildItem -LiteralPath $parentDir -Directory |
        Where-Object { $_.Name -match '^(\d+)\s' -and [int]$Matches[1] -eq $position } |
        Select-Object -First 1
      if ($child) { $directory = $child.FullName }
    }

    $node = @{
      Title       = $title
      Description = Limit-Description -Text $description -Title $title
      Directory   = $directory
      Children    = [System.Collections.ArrayList]::new()
    }
    $byNumbering[$numbering] = $node
    $dirByNumbering[$numbering] = $directory

    if ($parentKey -eq '') { [void]$roots.Add($node) }
    elseif ($byNumbering.ContainsKey($parentKey)) { [void]$byNumbering[$parentKey].Children.Add($node) }
  }

  return $roots.ToArray()
}

function Get-VaultNotes {
  <# The notes of a folder: every .md that is not a reserved name of the export. #>
  param([Parameter(Mandatory)][string]$Directory)
  return @(Get-ChildItem -LiteralPath $Directory -File -Filter '*.md' |
      Where-Object { $_.Name -notin @('GUIDANCE.md', 'STRUCTURE.md', 'TEMPLATE.md') } |
      Sort-Object Name)
}

function Write-VaultFolders {
  <#
    One level of the structure, and then its children: the folder, its Template,
    its notes and its subfolders, in that order and in the order the structure
    document gives, which is the order the numeric prefixes encode.

    Everything appends, so no position is ever computed here: the API places a
    new folder and a new note at the end of its parent.

    With -Preview it writes nothing and only prints the tree, which is the same
    traversal and therefore the same answer.
  #>
  param(
    [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Nodes,
    [string]$VaultId,
    [string]$Token,
    [string]$ParentFolderId,
    [switch]$Preview,
    [int]$Depth = 0
  )

  foreach ($node in $Nodes) {
    $title = $node.Title
    $description = $node.Description
    $templatePath = if ($node.Directory) { Join-Path $node.Directory 'TEMPLATE.md' } else { $null }
    $hasTemplate = $templatePath -and (Test-Path -LiteralPath $templatePath)
    $notes = if ($StructureOnly -or -not $node.Directory) {
      @()
    } else {
      Get-VaultNotes -Directory $node.Directory
    }
    $folderId = $null

    if ($Preview) {
      $indent = '  ' * $Depth
      $marks = @()
      if ($hasTemplate) { $marks += 'Template' }
      if ($notes.Count -gt 0) { $marks += "$($notes.Count) note(s)" }
      $suffix = if ($marks.Count -gt 0) { "  [$($marks -join ', ')]" } else { '' }
      Write-Host "         $indent$title$suffix" -ForegroundColor DarkGray
    } else {
      $folder = Invoke-Api -Method 'POST' -Path "/knowledge/vaults/$VaultId/folders" -Token $Token `
        -Body @{ parentFolderId = $ParentFolderId; name = $title; description = $description }
      $folderId = $folder.folderId
      Write-Detail "folder  $title"

      if ($hasTemplate) {
        Invoke-Api -Method 'PUT' `
          -Path "/knowledge/vaults/$VaultId/folders/$folderId/template" -Token $Token `
          -Body @{ content = (Get-VaultText -Path $templatePath) } | Out-Null
      }
    }
    $script:FolderCount++

    foreach ($note in $notes) {
      if ($MaxNotes -gt 0 -and $script:NoteCount -ge $MaxNotes) {
        $script:SkippedNotes++
        continue
      }
      if (-not $Preview) {
        $stated = Add-StatedTitle `
          -Text (Get-VaultText -Path $note.FullName) `
          -FileName ([System.IO.Path]::GetFileNameWithoutExtension($note.Name))
        if ($stated.Repaired) { $script:RepairedTitles++ }
        Invoke-Api -Method 'POST' -Path "/knowledge/vaults/$VaultId/notes" -Token $Token -Body @{
          folderId = $folderId
          content  = $stated.Text
        } | Out-Null
      }
      $script:NoteCount++
      if (-not $Preview -and $script:NoteCount % 25 -eq 0) {
        Write-Detail "$($script:NoteCount) notes written"
      }
    }

    Write-VaultFolders -Nodes $node.Children.ToArray() -VaultId $VaultId -Token $Token `
      -ParentFolderId $folderId -Preview:$Preview -Depth ($Depth + 1)
  }
}

# --- 1. Context --------------------------------------------------------------

Set-AwsContext -Region $Region -ProfileName $ProfileName

$context = Get-CdkContext
$zoneName = $context.hostedZoneName
$script:ApiOrigin = "https://api.$zoneName"

$vaultsRoot = Join-Path $PSScriptRoot 'vaults'
$sourceVaults = @()
if (Test-Path $vaultsRoot) {
  $sourceVaults = @(Get-ChildItem -LiteralPath $vaultsRoot -Directory | Sort-Object Name |
      ForEach-Object { $_.Name })
}

# --- 2. What is being created ------------------------------------------------

Write-Step 'What is being created'

# A preview creates nothing, so it needs no account and no plan.
if (-not $PreviewVault) {
  if (-not $Email) { $Email = (Read-Host '  e-mail of the account').Trim() }
  if (-not $Email) { throw 'No account to onboard: pass -Email.' }
  $Email = $Email.ToLowerInvariant()

  if (-not $Quota) {
    $Quota = Read-Choice -Title 'storage quota' -Options @('500MB', '1GB', '2GB') -Default '1GB' `
      -Labels @('declared, not enforced', '', '')
  }
  if (-not $Status) {
    $Status = Read-Choice -Title 'subscription status' `
      -Options @('active', 'trial', 'pending_approval', 'suspended', 'canceled', 'rejected') `
      -Default 'active' `
      -Labels @('grants access', 'grants access', 'waiting in the queue', 'no access', 'no access', 'no access')
  }
}

if (-not $VaultTemplate) {
  if ($sourceVaults.Count -eq 0) {
    $VaultTemplate = 'none'
    Write-Warn "no vault tree under $vaultsRoot; the account gets no vault"
  } else {
    $VaultTemplate = Read-Choice -Title 'vault to write' -Options ($sourceVaults + 'none') `
      -Default $sourceVaults[0]
  }
}
if ($VaultTemplate -ne 'none' -and $sourceVaults -notcontains $VaultTemplate) {
  throw "There is no vault called '$VaultTemplate'. Available: $($sourceVaults -join ', ')."
}

$writesVault = $VaultTemplate -ne 'none'
$vaultRoot = if ($writesVault) { Join-Path $vaultsRoot $VaultTemplate } else { $null }
$guidance = ''
$structure = @()
if ($writesVault) {
  $guidancePath = Join-Path $vaultRoot 'GUIDANCE.md'
  if (Test-Path -LiteralPath $guidancePath) { $guidance = Get-VaultText -Path $guidancePath }
  # The name of the vault is the first heading of its Guidance, which is what
  # the export wrote there; the slug is the fallback when there is none.
  if (-not $VaultName) {
    $heading = [regex]::Match($guidance, '(?m)^#\s+(.+?)\s*$')
    $VaultName = if ($heading.Success) { $heading.Groups[1].Value } else { $VaultTemplate }
  }
  $structure = Get-StructureTree -VaultRoot $vaultRoot
}

if (-not $PreviewVault) {
  Write-Host ''
  Write-Host "  account          $Email"
  Write-Host "  subscription     $Type, $Quota, $Status"
  Write-Host "  vault            $VaultTemplate"
}

# --- 3. Preview, which stops here --------------------------------------------

if ($PreviewVault) {
  if (-not $writesVault) {
    Write-Warn 'nothing to preview: no vault was chosen'
    exit 0
  }
  Write-Step "The vault '$VaultName' would be written as"
  if ($guidance) { Write-Detail "Guidance, $($guidance.Length) characters" }
  Write-VaultFolders -Nodes $structure -Preview
  Write-Host ''
  Write-Ok "$($script:FolderCount) folder(s), $($script:NoteCount) note(s)"
  if ($StructureOnly) { Write-Detail 'notes left out by -StructureOnly' }
  if ($script:RepairedTitles -gt 0) {
    Write-Detail "$($script:RepairedTitles) note(s) got their file name written as title:"
  }
  if ($script:SkippedNotes -gt 0) {
    Write-Detail "$($script:SkippedNotes) note(s) left out by -MaxNotes $MaxNotes"
  }
  $orphans = @(Get-VaultNotes -Directory $vaultRoot)
  if ($orphans.Count -gt 0) {
    Write-Warn "$($orphans.Count) note(s) sit at the root of the vault tree and have no folder; they would be skipped"
  }
  Write-Detail 'nothing was created: this was a preview'
  exit 0
}

# --- 4. The environment and the account --------------------------------------

$identity = Get-StackOutputs -StackName 'MemorysmithIdentity'
if (-not $identity -or -not $identity['UserPoolId'] -or -not $identity['WebClientId']) {
  throw 'MemorysmithIdentity has no outputs; deploy the environment before onboarding anyone.'
}
$userPoolId = $identity['UserPoolId']
$clientId = $identity['WebClientId']

Write-Step 'Environment'
Write-Host "  api              $script:ApiOrigin"
Write-Host "  user pool        $userPoolId"

Write-Step 'The account in Cognito'

$existing = Invoke-Aws -AllowFailure -Arguments @(
  'cognito-idp', 'admin-get-user', '--user-pool-id', $userPoolId, '--username', $Email
)

<#
  An account that has never set a password is one nobody holds: it came out of
  an invitation and stopped there, which is also what a run interrupted halfway
  leaves behind. Taking it over costs nothing and is how a second run finishes
  what the first one started. An account in any other state belongs to a
  person, and the only way in is the password that person has.
#>
$unclaimed = @('FORCE_CHANGE_PASSWORD', 'RESET_REQUIRED')
$claimed = $existing -and $unclaimed -notcontains $existing.UserStatus
$handOver = -not ($SetPassword -or $claimed)

if ($claimed) {
  Write-Ok "$Email already exists"
  # Its password is that person's own, and this run neither learns nor
  # replaces it.
  $password = Read-Secret -Prompt "password for $Email"
} else {
  if ($existing) {
    Write-Detail "$Email exists and was never signed in to, so this run takes it over"
  } else {
    Write-Detail 'creating it; the invitation goes out at the end, not now'

    $attributes = @(
      @{ Name = 'email'; Value = $Email },
      @{ Name = 'email_verified'; Value = 'true' }
    )
    if ($Name) { $attributes += @{ Name = 'name'; Value = $Name } }
    $created = Invoke-Aws -AllowFailure -Arguments @(
      'cognito-idp', 'admin-create-user',
      '--user-pool-id', $userPoolId,
      '--username', $Email,
      '--message-action', 'SUPPRESS',
      '--user-attributes', ($attributes | ConvertTo-Json -Compress -AsArray)
    )
    # A pool that does not carry the `name` attribute refuses it; the account is
    # worth more than the display name, so it is created without one.
    if (-not $created -and $Name) {
      Write-Warn 'the pool refused the name attribute; creating the account without it'
      $bare = @(
        @{ Name = 'email'; Value = $Email },
        @{ Name = 'email_verified'; Value = 'true' }
      )
      $created = Invoke-Aws -AllowFailure -Arguments @(
        'cognito-idp', 'admin-create-user',
        '--user-pool-id', $userPoolId,
        '--username', $Email,
        '--message-action', 'SUPPRESS',
        '--user-attributes', ($bare | ConvertTo-Json -Compress -AsArray)
      )
    }
    if (-not $created) { throw "Could not create $Email in the pool." }
  }

  <#
    The password of this stretch is the script's own unless it was asked for:
    it exists because the subscription and the vault are written as the
    account, and an account waiting for its first password answers every
    sign-in with a challenge instead of a token. It is permanent for the same
    reason, and it is replaced by a provisional one at the end.
  #>
  $password = if ($SetPassword) {
    Read-Secret -Prompt "new password for $Email" -Confirm
  } else {
    New-WorkingPassword
  }
  Invoke-Aws -Arguments @(
    'cognito-idp', 'admin-set-user-password',
    '--user-pool-id', $userPoolId,
    '--username', $Email,
    '--password', $password,
    '--permanent'
  ) | Out-Null

  Write-Ok "$Email is ready"
  if ($handOver) {
    Write-Detail 'the password of this run is temporary and nobody sees it; the account is handed over at the end'
  }
}

# --- 5. Who authorizes -------------------------------------------------------
# Somebody has to authorize the very first subscription, and on an empty pool
# there is nobody. The first account becomes a platform admin for that reason
# alone; once the group has a member, the platform is not handed out again.

Write-Step 'Who authorizes'

$groups = Invoke-Aws -AllowFailure -Arguments @(
  'cognito-idp', 'admin-list-groups-for-user',
  '--user-pool-id', $userPoolId, '--username', $Email
)
$isAdmin = $false
if ($groups -and $groups.Groups) {
  $isAdmin = @($groups.Groups | Where-Object { $_.GroupName -eq 'platform-admin' }).Count -gt 0
}

if ($isAdmin) {
  Write-Ok "$Email is already a platform admin"
} else {
  $members = Invoke-Aws -AllowFailure -Arguments @(
    'cognito-idp', 'list-users-in-group',
    '--user-pool-id', $userPoolId, '--group-name', 'platform-admin', '--limit', '1'
  )
  $hasAdmin = $members -and $members.Users -and @($members.Users).Count -gt 0
  if (-not $hasAdmin) {
    Invoke-Aws -Arguments @(
      'cognito-idp', 'admin-add-user-to-group',
      '--user-pool-id', $userPoolId, '--username', $Email, '--group-name', 'platform-admin'
    ) | Out-Null
    $isAdmin = $true
    Write-Ok "$Email is the first account of this pool, so it operates the platform"
  } else {
    Write-Detail 'this pool already has a platform admin, so this account is not made one'
  }
}

# --- 6. Sign in --------------------------------------------------------------

Write-Step 'Signing in'
$token = Get-CognitoToken -UserPoolId $userPoolId -ClientId $clientId `
  -Username $Email -Password $password -ZoneName $zoneName
Write-Ok 'signed in'

$session = Invoke-Api -Method 'GET' -Path '/access/session' -Token $token

# The token that authorizes is this one when the account operates the platform,
# and one asked for here when it does not.
$adminToken = $token
if (-not $session.user.isPlatformAdmin) {
  Write-Detail 'this account cannot authorize its own subscription'
  $adminEmail = (Read-Host '  e-mail of a platform admin').Trim()
  if (-not $adminEmail) { throw 'No platform admin given, and this account is not one.' }
  $adminPassword = Read-Secret -Prompt "password for $adminEmail"
  $adminToken = Get-CognitoToken -UserPoolId $userPoolId -ClientId $clientId `
    -Username $adminEmail -Password $adminPassword -ZoneName $zoneName
  $adminSession = Invoke-Api -Method 'GET' -Path '/access/session' -Token $adminToken
  if (-not $adminSession.user.isPlatformAdmin) {
    throw "$adminEmail is not in the platform-admin group either."
  }
  Write-Ok "authorizing as $adminEmail"
}

# --- 7. The subscription -----------------------------------------------------
# A subscription this account already holds is reused: asking twice would leave
# two of them in the queue and only one would ever be entered.

Write-Step 'The subscription'

$mine = @($session.subscriptions | Where-Object { $_.isOwner })
if ($mine.Count -gt 0) {
  $subscriptionId = $mine[0].subscriptionId
  Write-Ok "reusing $subscriptionId, which this account already holds"
} else {
  $created = Invoke-Api -Method 'POST' -Path '/access/subscriptions' -Token $token `
    -Body @{ type = $Type; quota = $Quota }
  $subscriptionId = $created.subscriptionId
  if (-not $subscriptionId) { throw 'The request returned no subscription id.' }
  Write-Ok "$subscriptionId requested"
}

<#
  Writing the vault needs a subscription that grants operational access
  (RN-SUB-007), and the status that was asked for may not be one. The vault is
  therefore written under `active`, and the chosen status is applied last. Both
  moves go through the administrative override, which is the route that sets a
  status without walking the transition machine (RN-SUB-018).
#>
$operational = @('trial', 'active')
$workingStatus = if ($writesVault -and $operational -notcontains $Status) { 'active' } else { $Status }

Invoke-Api -Method 'PUT' -Path "/access/platform/subscriptions/$subscriptionId/status" `
  -Token $adminToken -Body @{ status = $workingStatus } | Out-Null
Invoke-Api -Method 'PATCH' -Path "/access/platform/subscriptions/$subscriptionId/plan" `
  -Token $adminToken -Body @{ type = $Type; quota = $Quota } | Out-Null
Write-Ok "$workingStatus, $Type, $Quota"
if ($workingStatus -ne $Status) {
  Write-Detail "temporarily, so the vault can be written; it ends as $Status"
}

# --- 8. The vault ------------------------------------------------------------

$vaultId = $null

if ($writesVault) {
  # The claim is minted with the token, so the session that writes the vault is
  # a NEW one: the token from step 6 carries no subscription at all.
  Write-Step 'Signing in again, now with the subscription in the token'
  $token = Get-CognitoToken -UserPoolId $userPoolId -ClientId $clientId `
    -Username $Email -Password $password -ZoneName $zoneName
  Write-Ok 'the token carries the subscription'

  Write-Step "Writing the vault '$VaultName'"
  $vault = Invoke-Api -Method 'POST' -Path '/knowledge/vaults' -Token $token `
    -Body @{ name = $VaultName; description = '' }
  $vaultId = $vault.vaultId
  if (-not $vaultId) { throw 'Creating the vault returned no id.' }
  Write-Ok $vaultId

  if ($guidance) {
    Invoke-Api -Method 'PUT' -Path "/knowledge/vaults/$vaultId/guidance" -Token $token `
      -Body @{ content = $guidance } | Out-Null
    Write-Detail 'Guidance written'
  }

  # A note at the root of the vault tree has no folder to go in, and a note without a
  # folder is not representable in the product. Saying so beats writing five
  # hundred notes and leaving three behind in silence.
  $orphans = @(Get-VaultNotes -Directory $vaultRoot)
  if ($orphans.Count -gt 0) {
    Write-Warn "$($orphans.Count) note(s) sit at the root of the vault tree and have no folder; skipped"
  }

  Write-VaultFolders -Nodes $structure -VaultId $vaultId -Token $token
  Write-Ok "$($script:FolderCount) folder(s), $($script:NoteCount) note(s)"
  if ($StructureOnly) { Write-Detail 'notes left out by -StructureOnly' }
  if ($script:RepairedTitles -gt 0) {
    Write-Detail "$($script:RepairedTitles) note(s) got their file name written as title:"
  }
  if ($script:SkippedNotes -gt 0) {
    Write-Detail "$($script:SkippedNotes) note(s) left out by -MaxNotes $MaxNotes"
  }
}

# --- 9. The status it was asked to end in ------------------------------------

if ($workingStatus -ne $Status) {
  Write-Step "Setting the subscription to $Status"
  Invoke-Api -Method 'PUT' -Path "/access/platform/subscriptions/$subscriptionId/status" `
    -Token $adminToken -Body @{ status = $Status } | Out-Null
  Write-Ok "$subscriptionId is $Status"
}

# --- 10. Handing the account over --------------------------------------------
# Every sign-in this run needed is behind it, so the password it used has no
# reason to keep existing. What is left on the account is a provisional one
# that only the person receives, by e-mail, and that the sign-in page replaces
# the first time it is used.

$provisional = ''
if ($handOver) {
  Write-Step 'Handing the account over'
  $provisional = Send-Invitation -UserPoolId $userPoolId -Email $Email
  if ($provisional) {
    Write-Warn 'the pool did not send the invitation e-mail'
    Write-Detail 'the provisional password is printed below; hand it over by another route'
  } else {
    Write-Ok "an invitation with a provisional password was sent to $Email"
  }
}

# --- 11. What happens next ---------------------------------------------------

Write-Step 'Done'
$adminNote = if ($isAdmin) { '  (platform admin)' } else { '' }
Write-Host "  account          $Email$adminNote"
Write-Host "  subscription     $subscriptionId  ($Type, $Quota, $Status)"
if ($vaultId) {
  Write-Host "  vault            $vaultId  ($($script:FolderCount) folders, $($script:NoteCount) notes)"
}

Write-Host ''
if ($handOver) {
  if ($provisional) {
    Write-Host "  provisional      $provisional"
  }
  Write-Detail "the first sign-in at https://$zoneName asks for a password of their own"
}
if ($operational -contains $Status) {
  Write-Ok "sign in at https://$zoneName"
  Write-Detail 'the claim is minted when the token is, so sign out and in again on a browser that was already open'
} else {
  Write-Ok "the account exists, and its subscription is $Status"
  Write-Detail 'a subscription outside trial and active grants no operational access, to anyone, not even its owner'
}
exit 0
