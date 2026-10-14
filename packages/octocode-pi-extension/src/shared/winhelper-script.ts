/**
 * The program of the Windows helper (winhelper.ts), run as `pwsh -EncodedCommand`. Keep it small: it is the one piece
 * that cannot be tested off Windows, so it only does what Windows alone can, and every decision lives in TypeScript.
 *
 * Protocol, one JSON object per line. The helper first prints `{"ready":true}`. Requests have an `id` and a `cmd`:
 *   assign  {pid}      a new Job Object (kill on close), the process with that pid assigned to it  -> {id, ok}
 *   kill    {pid}      terminate every process in that pid's job                                  -> {id, ok}
 *   parse   {command}  the commands of a PowerShell script, as `Parser.ParseInput` sees them      -> {id, ok, commands}
 * `ok: false` carries an `error`. Each root gets its own job, so one tree can end while the others run. The jobs
 * have `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` and no other limit (so no flag lets a child leave the job), and the helper
 * keeps their handles: when its stdin closes, or Pi dies, the helper exits and Windows ends every tree. A process
 * must be assigned before it starts children (those join the job); children it started earlier are not in it.
 *
 * Rules for editing: no backticks and no `${` (this is a template literal); no word the tests forbid (the flags that
 * let a process leave its job); no use of `$pid` or `$input`, which PowerShell reserves; C# 5 only (Windows
 * PowerShell 5.1 compiles it); everything that is written to stdout is one JSON line.
 */
export const WINDOWS_HELPER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$jobsReady = $true
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class OctocodeJob {
  const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  const int JobObjectExtendedLimitInformation = 9;
  const uint PROCESS_SET_QUOTA = 0x0100;
  const uint PROCESS_TERMINATE = 0x0001;
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong Read; public ulong Write; public ulong Other; public ulong ReadBytes; public ulong WriteBytes; public ulong OtherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, int size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint exitCode);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
  static Exception Fail(string call) { return new InvalidOperationException(call + " failed with error " + Marshal.GetLastWin32Error()); }
  public static IntPtr Create() {
    IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
    if (job == IntPtr.Zero) throw Fail("CreateJobObject");
    ExtendedLimits limits = new ExtendedLimits();
    limits.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits, Marshal.SizeOf(typeof(ExtendedLimits)))) {
      Exception error = Fail("SetInformationJobObject");
      CloseHandle(job);
      throw error;
    }
    return job;
  }
  public static void Assign(IntPtr job, int pid) {
    IntPtr process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid);
    if (process == IntPtr.Zero) throw Fail("OpenProcess");
    try { if (!AssignProcessToJobObject(job, process)) throw Fail("AssignProcessToJobObject"); }
    finally { CloseHandle(process); }
  }
  public static void Terminate(IntPtr job) { if (!TerminateJobObject(job, 1)) throw Fail("TerminateJobObject"); }
  public static void Close(IntPtr job) { CloseHandle(job); }
}
'@
} catch {
  # Parsing still works; assign says why it cannot.
  $jobsReady = $false
  $jobsError = $_.Exception.Message
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $utf8, $false)
$writer = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $utf8)
$writer.AutoFlush = $true
function Send($response) { $writer.WriteLine((ConvertTo-Json -InputObject $response -Compress -Depth 8)) }

$jobs = @{}
function Close-Tree([int]$root, [bool]$terminate) {
  if (-not $jobs.ContainsKey($root)) { return $false }
  $handle = $jobs[$root]
  $jobs.Remove($root)
  try { if ($terminate) { [OctocodeJob]::Terminate($handle) } } finally { [OctocodeJob]::Close($handle) }
  return $true
}

function Read-Commands([string]$source) {
  $errors = $null
  $tokens = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) { throw $errors[0].Message }
  $found = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true)
  $commands = New-Object System.Collections.ArrayList
  foreach ($command in $found) {
    $args2 = New-Object System.Collections.ArrayList
    for ($i = 1; $i -lt $command.CommandElements.Count; $i++) {
      $element = $command.CommandElements[$i]
      if ($element -is [System.Management.Automation.Language.CommandParameterAst]) {
        $item = @{ param = $element.ParameterName; text = $element.Extent.Text }
        if ($null -ne $element.Argument) { $item.arg = $element.Argument.Extent.Text }
      } else {
        $item = @{ text = $element.Extent.Text }
        if ($element -is [System.Management.Automation.Language.StringConstantExpressionAst] -or $element -is [System.Management.Automation.Language.ExpandableStringExpressionAst]) { $item.value = $element.Value }
      }
      [void]$args2.Add($item)
    }
    [void]$commands.Add(@{ name = $command.GetCommandName(); args = $args2 })
  }
  return ,$commands
}

Send @{ ready = $true }
while ($null -ne ($line = $reader.ReadLine())) {
  $id = 0
  try {
    $request = ConvertFrom-Json -InputObject $line
    $id = $request.id
    if ($request.cmd -eq 'assign') {
      if (-not $jobsReady) { throw $jobsError }
      $root = [int]$request.pid
      [void](Close-Tree $root $true)
      $handle = [OctocodeJob]::Create()
      try { [OctocodeJob]::Assign($handle, $root) } catch { [OctocodeJob]::Close($handle); throw }
      $jobs[$root] = $handle
      Send @{ id = $id; ok = $true }
    } elseif ($request.cmd -eq 'kill') {
      if (-not (Close-Tree ([int]$request.pid) $true)) { throw 'no job for that pid' }
      Send @{ id = $id; ok = $true }
    } elseif ($request.cmd -eq 'parse') {
      Send @{ id = $id; ok = $true; commands = (Read-Commands ([string]$request.command)) }
    } else {
      throw 'unknown command'
    }
  } catch {
    Send @{ id = $id; ok = $false; error = [string]$_.Exception.Message }
  }
}
foreach ($root in @($jobs.Keys)) { [void](Close-Tree $root $false) }
`;
