export function classifyPressure({
  availableMemoryGb,
  hermesMemoryHighHit = false,
  hermesMemoryMaxHit = false,
  cpuQuotaPercent = 0,
} = {}) {
  if (hermesMemoryMaxHit || (availableMemoryGb != null && availableMemoryGb < 1.0)) {
    return {
      level: 'RED',
      admit_local_sandbox: false,
      stop_optional_background: true,
      reclaim_dev_then_sandbox: true,
    };
  }
  if (availableMemoryGb != null && availableMemoryGb < 3.0) {
    return {
      level: 'ORANGE',
      admit_local_sandbox: false,
      stop_optional_background: true,
      reclaim_dev_then_sandbox: false,
    };
  }
  if (hermesMemoryHighHit || cpuQuotaPercent > 125) {
    return {
      level: 'YELLOW',
      admit_local_sandbox: false,
      stop_optional_background: false,
      reclaim_dev_then_sandbox: false,
    };
  }
  return {
    level: 'GREEN',
    admit_local_sandbox: true,
    stop_optional_background: false,
    reclaim_dev_then_sandbox: false,
  };
}
