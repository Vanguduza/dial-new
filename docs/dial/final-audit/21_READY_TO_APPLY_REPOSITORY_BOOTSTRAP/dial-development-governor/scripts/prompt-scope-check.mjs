const p=process.env.CLAUDE_USER_PROMPT||'';
if(/build\s+(all|everything|the whole)/i.test(p) && !/bootstrap|audit/i.test(p)){console.error('Unbounded DIAL prompt detected. Resolve Feature IDs/workstream first.');process.exit(2)}
