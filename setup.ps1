# =============================================================================
# Setup script (PowerShell)
# =============================================================================
#
# Bootstraps a local coding agent environment by pulling skills, agents, and
# config files from the kimgoetzke/coding-agent-configs GitHub repository into
# the correct local directories.
#
# Usage:
#   Interactive (prompts for agent choice):
#     iwr -useb https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.ps1 | iex
#
#   Non-interactive (pass agent as argument):
#     & ([scriptblock]::Create((iwr -useb 'https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.ps1').Content)) -Agent claude
#     & ([scriptblock]::Create((iwr -useb 'https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.ps1').Content)) -Agent copilot
#     & ([scriptblock]::Create((iwr -useb 'https://raw.githubusercontent.com/kimgoetzke/coding-agent-configs/main/setup.ps1').Content)) -Agent pi
#
# What it installs:
#   - All shared skills from skills/ -> the selected agent's skills directory
#   - Agent definitions from the selected agent tree -> the local agents directory
#   - Config files from the selected agent tree -> the local config directory
#   - For Pi, optional starter extensions and themes from .pi/agent/
#
# Optional environment:
#   - REPO_URL: Override the repository URL/path for local testing
#
# Requirements:
#   - git (for sparse checkout of the repository)
#   - PowerShell 5.1 or later
# =============================================================================

[CmdletBinding()]
param(
    [ValidateSet('claude', 'copilot', 'pi')]
    [string]$Agent,

    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$RepoUrl = if ($env:REPO_URL)
{ $env:REPO_URL 
} else
{ 'https://github.com/kimgoetzke/coding-agent-configs.git' 
}

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

function Write-Info
{ param([string]$Message) Write-Host '[info]  ' -ForegroundColor Blue -NoNewline; Write-Host $Message 
}
function Write-Ok
{ param([string]$Message) Write-Host '[ok]    ' -ForegroundColor Green -NoNewline; Write-Host $Message 
}
function Write-Warn
{ param([string]$Message) Write-Host '[warn]  ' -ForegroundColor Yellow -NoNewline; Write-Host $Message 
}
function Write-Err
{ param([string]$Message) Write-Host '[error] ' -ForegroundColor Red -NoNewline; Write-Host $Message 
}

function Show-Usage
{
    Write-Host 'Usage: setup.ps1 [-Agent claude|copilot|pi]'
    Write-Host ''
    Write-Host '  -Agent claude    Set up for Claude Code'
    Write-Host '  -Agent copilot   Set up for GitHub Copilot'
    Write-Host '  -Agent pi        Set up for Pi'
    Write-Host ''
    Write-Host 'If no agent is provided, the script will prompt interactively.'
}

# Prompt the user for a yes/no answer. Returns $true for yes, $false otherwise.
function Read-YesNo
{
    param([string]$Prompt)
    $answer = Read-Host "$Prompt [y/N]"
    return ($answer -match '^[Yy]$')
}

# Copy a config file to the target directory, prompting before overwriting.
function Copy-ConfigFile
{
    param(
        [string]$SourceFile,
        [string]$TargetDir
    )
    $filename = Split-Path -Leaf $SourceFile
    $targetFile = Join-Path $TargetDir $filename

    if (Test-Path $targetFile)
    {
        if (Read-YesNo "  $filename already exists in $TargetDir. Overwrite?")
        {
            Copy-Item -Path $SourceFile -Destination $targetFile -Force
            Write-Ok "Overwrote $filename"
        } else
        {
            Write-Warn "Skipped $filename (kept existing)"
        }
    } else
    {
        Copy-Item -Path $SourceFile -Destination $targetFile -Force
        Write-Ok "Installed $filename"
    }
}

# Copy a directory tree to the target parent directory, replacing any existing
# directory with the same name.
function Copy-DirectoryOverwrite
{
    param(
        [string]$SourceDir,
        [string]$TargetParent
    )
    $dirName = Split-Path -Leaf $SourceDir.TrimEnd('\', '/')
    $targetDir = Join-Path $TargetParent $dirName

    if (Test-Path $targetDir)
    {
        Remove-Item -Path $targetDir -Recurse -Force
    }
    if (-not (Test-Path $TargetParent))
    {
        New-Item -ItemType Directory -Path $TargetParent -Force | Out-Null
    }
    Copy-Item -Path $SourceDir -Destination $TargetParent -Recurse -Force
    Write-Ok "Installed $dirName"
}

# -----------------------------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------------------------

if ($Help)
{
    Show-Usage
    exit 0
}

# -----------------------------------------------------------------------------
# Agent selection (interactive if no flag was provided)
# -----------------------------------------------------------------------------

if (-not $Agent)
{
    Write-Host ''
    Write-Host 'Which coding agent are you using?'
    Write-Host ''
    Write-Host '  1) Claude Code'
    Write-Host '  2) GitHub Copilot'
    Write-Host '  3) Pi'
    Write-Host ''

    $choice = Read-Host 'Enter 1, 2, or 3'

    switch ($choice)
    {
        '1'
        { $Agent = 'claude' 
        }
        '2'
        { $Agent = 'copilot' 
        }
        '3'
        { $Agent = 'pi' 
        }
        default
        {
            Write-Err "Invalid choice: $choice"
            exit 1
        }
    }
}

# Set paths based on the selected agent
switch ($Agent)
{
    'claude'
    {
        $AgentDir = Join-Path $HOME '.claude'
        $RepoAgentDir = '.claude'
        $AgentFileGlob = '*.md'
    }
    'copilot'
    {
        $AgentDir = Join-Path $HOME '.copilot'
        $RepoAgentDir = '.copilot'
        $AgentFileGlob = '*.agent.md'
    }
    'pi'
    {
        $AgentDir = Join-Path $HOME '.pi/agent'
        $RepoAgentDir = '.pi/agent'
        $AgentFileGlob = '*.md'
    }
}

Write-Host ''
Write-Info "Setting up kimgoetzke/coding-agent-configs for $Agent"

# -----------------------------------------------------------------------------
# Clone the repository (shallow + sparse for speed)
# -----------------------------------------------------------------------------
# Uses git's partial clone and sparse-checkout to download only the directories
# we need, rather than the entire repository history and contents.
# -----------------------------------------------------------------------------

Write-Info 'Fetching latest files from the repository...'

$TempDirRemote = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $TempDirRemote -Force | Out-Null

try
{
    $repoPath = Join-Path $TempDirRemote 'repo'

    # Native command stderr (even harmless warnings like "--depth is ignored in
    # local clones") becomes a terminating error under ErrorActionPreference=Stop
    # in PS 5.1. Relax it around git calls and check $LASTEXITCODE explicitly.
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try
    {
        & git clone --depth 1 --filter=blob:none --sparse $RepoUrl $repoPath --quiet 2>$null
        if ($LASTEXITCODE -ne 0)
        {
            Write-Err "git clone failed (exit code $LASTEXITCODE)"
            exit 1
        }

        # Check out only the skills directory and the selected agent's directory
        & git -C $repoPath sparse-checkout set 'skills/' "$RepoAgentDir/" 2>$null
        if ($LASTEXITCODE -ne 0)
        {
            Write-Err "git sparse-checkout failed (exit code $LASTEXITCODE)"
            exit 1
        }
    } finally
    {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    Write-Ok 'Fetched repository contents'

    # Verify the clone contains what we expect
    if (-not (Test-Path (Join-Path $repoPath 'skills')))
    {
        Write-Err 'Could not find skills/ in the repository'
        exit 1
    }

    if (-not (Test-Path (Join-Path $repoPath $RepoAgentDir)))
    {
        Write-Err "Could not find $RepoAgentDir/ in the repository"
        exit 1
    }

    # -------------------------------------------------------------------------
    # Install skills
    # -------------------------------------------------------------------------
    # Skills are shared across agents and are copied as complete directories.
    # Existing skills are overwritten (same behaviour as the update-skills command).
    # -------------------------------------------------------------------------

    $skillCount = 0
    $skillsSkipped = $false

    Write-Host ''
    if (Read-YesNo 'Install skills?')
    {
        Write-Info 'Installing skills...'

        $skillsSource = Join-Path $repoPath 'skills'
        $skillsTarget = Join-Path $AgentDir 'skills'
        New-Item -ItemType Directory -Path $skillsTarget -Force | Out-Null

        Get-ChildItem -Path $skillsSource -Directory | ForEach-Object {
            Copy-DirectoryOverwrite -SourceDir $_.FullName -TargetParent $skillsTarget
            $skillCount++
        }

        Write-Ok "Installed $skillCount skills to $skillsTarget"
    } else
    {
        Write-Warn 'Skipped skills installation'
        $skillsSkipped = $true
    }

    # -------------------------------------------------------------------------
    # Install agents
    # -------------------------------------------------------------------------
    # Agent definitions are agent-specific files. Existing agents are overwritten
    # (same behaviour as the update-agents command).
    # -------------------------------------------------------------------------

    $agentCount = 0
    $agentsSkipped = $false

    Write-Host ''
    if (Read-YesNo 'Install agents?')
    {
        Write-Info 'Installing agents...'

        $agentsSource = Join-Path $repoPath (Join-Path $RepoAgentDir 'agents')
        $agentsTarget = Join-Path $AgentDir 'agents'
        New-Item -ItemType Directory -Path $agentsTarget -Force | Out-Null

        if (Test-Path $agentsSource)
        {
            Get-ChildItem -Path $agentsSource -File -Filter $AgentFileGlob | ForEach-Object {
                Copy-Item -Path $_.FullName -Destination $agentsTarget -Force
                $agentCount++
            }
        }

        Write-Ok "Installed $agentCount agents to $agentsTarget"
    } else
    {
        Write-Warn 'Skipped agents installation'
        $agentsSkipped = $true
    }

    # -------------------------------------------------------------------------
    # Install config files (with overwrite protection)
    # -------------------------------------------------------------------------
    # Config files may contain user-specific customisations (permissions, plugins,
    # etc.), so the script prompts before overwriting any that already exist.
    # -------------------------------------------------------------------------

    $configsSkipped = $false

    Write-Host ''
    if (Read-YesNo 'Install config files?')
    {
        Write-Info 'Installing config files...'

        $configSource = Join-Path $repoPath $RepoAgentDir

        # Determine which config files to install based on the agent
        $configFiles = switch ($Agent)
        {
            'claude'
            { @('CLAUDE.md', 'settings.json', 'statusline-command.sh') 
            }
            'copilot'
            { @('copilot-instructions.md', 'hooks.json') 
            }
            'pi'
            { @('AGENTS.md', 'settings.json', 'command-policy.json5') 
            }
        }

        New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null

        foreach ($configFile in $configFiles)
        {
            $sourcePath = Join-Path $configSource $configFile
            if (Test-Path $sourcePath)
            {
                Copy-ConfigFile -SourceFile $sourcePath -TargetDir $AgentDir
            } else
            {
                Write-Warn "$configFile not found in repository - skipped"
            }
        }
    } else
    {
        Write-Warn 'Skipped config files installation'
        $configsSkipped = $true
    }

    # -------------------------------------------------------------------------
    # Install Pi extensions
    # -------------------------------------------------------------------------

    $piExtensionsSkipped = $false
    $piExtensionCount = 0

    if ($Agent -eq 'pi')
    {
        Write-Host ''
        if (Read-YesNo 'Install Pi starter extensions?')
        {
            Write-Info 'Installing Pi extensions...'

            $piExtensionsSource = Join-Path $repoPath (Join-Path $RepoAgentDir 'extensions')
            $piExtensionsTarget = Join-Path $AgentDir 'extensions'
            New-Item -ItemType Directory -Path $piExtensionsTarget -Force | Out-Null

            if (Test-Path $piExtensionsSource)
            {
                Get-ChildItem -Path $piExtensionsSource -Directory | ForEach-Object {
                    Copy-DirectoryOverwrite -SourceDir $_.FullName -TargetParent $piExtensionsTarget
                    $piExtensionCount++
                }
            }

            Write-Ok "Installed $piExtensionCount Pi extensions to $piExtensionsTarget"
        } else
        {
            Write-Warn 'Skipped Pi extensions installation'
            $piExtensionsSkipped = $true
        }
    }

    # -------------------------------------------------------------------------
    # Install Pi themes
    # -------------------------------------------------------------------------

    $piThemesSkipped = $false
    $piThemeCount = 0

    if ($Agent -eq 'pi')
    {
        Write-Host ''
        if (Read-YesNo 'Install Pi themes?')
        {
            Write-Info 'Installing Pi themes...'

            $piThemesSource = Join-Path $repoPath (Join-Path $RepoAgentDir 'themes')
            $piThemesTarget = Join-Path $AgentDir 'themes'
            New-Item -ItemType Directory -Path $piThemesTarget -Force | Out-Null

            if (Test-Path $piThemesSource)
            {
                Get-ChildItem -Path $piThemesSource -File -Filter '*.json' | ForEach-Object {
                    Copy-Item -Path $_.FullName -Destination $piThemesTarget -Force
                    $piThemeCount++
                }
            }

            Write-Ok "Installed $piThemeCount Pi themes to $piThemesTarget"
        } else
        {
            Write-Warn 'Skipped Pi themes installation'
            $piThemesSkipped = $true
        }
    }

    # -------------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------------

    Write-Host ''
    Write-Host '=============================='
    Write-Host '  Setup complete!'
    Write-Host '=============================='
    Write-Host ''
    Write-Host "  Agent:   $Agent"
    if ($skillsSkipped)
    {
        Write-Host '  Skills:  skipped'
    } else
    {
        Write-Host "  Skills:  $skillCount installed to $AgentDir/skills"
    }
    if ($agentsSkipped)
    {
        Write-Host '  Agents:  skipped'
    } else
    {
        Write-Host "  Agents:  $agentCount installed to $AgentDir/agents"
    }
    if ($configsSkipped)
    {
        Write-Host '  Config:  skipped'
    } else
    {
        Write-Host "  Config:  $AgentDir"
    }
    if ($Agent -eq 'pi')
    {
        if ($piExtensionsSkipped)
        {
            Write-Host '  Extensions: skipped'
        } else
        {
            Write-Host "  Extensions: $piExtensionCount installed to $AgentDir/extensions"
        }
        if ($piThemesSkipped)
        {
            Write-Host '  Themes: skipped'
        } else
        {
            Write-Host "  Themes: $piThemeCount installed to $AgentDir/themes"
        }
    }
    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host '  1. Start your coding agent and verify the setup'
    Write-Host '  2. Use /update-skills later to fetch updates'
    Write-Host ''
} finally
{
    if (Test-Path $TempDirRemote)
    {
        Remove-Item -Path $TempDirRemote -Recurse -Force -ErrorAction SilentlyContinue
    }
}
