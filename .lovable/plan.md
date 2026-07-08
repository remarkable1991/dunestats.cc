Update `src/components/Logo.tsx` line 16-18: color the whole "STRATEGY" word with `text-coral` and the whole "ARENA" word with `text-teal`, removing the per-letter split.

```tsx
<span className="font-display text-lg font-bold tracking-wider">
  <span className="text-coral">STRATEGY</span> <span className="text-teal">ARENA</span>
</span>
```