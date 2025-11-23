# Color Meter Features - Quick Reference UI Guide

## Reference Box Layout

```
┌─────────────────────────────────────────┐
│        CAMERA PREVIEW (LIVE)            │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘

┌──────────────────────┬──────────────────────┐
│   LEFT BOX           │   RIGHT BOX          │
│   ┌────────────┐     │   ┌────────────┐    │
│   │            │     │   │            │    │
│   │  0.4" x    │     │   │  0.4" x    │    │
│   │  0.4"      │     │   │  0.4"      │    │
│   │            │     │   │            │    │
│   └────────────┘     │   └────────────┘    │
│                      │                     │
│ Place white          │ Put color to        │
│ paper here           │ measure here        │
│                      │                     │
│ [−] 0.4 [+] [✓]      │ [−] 0.4 [+]        │
│  Size Toggle         │     Size           │
└──────────────────────┴──────────────────────┘

⚠️ WARNING (if shown):
┌─────────────────────────────────────────┐
│  Too dark to measure reliably           │
│  (or other white surface warning)       │
└─────────────────────────────────────────┘
```

## Control Buttons

### Left Box Controls
```
[−] Button         → Decrease size by 0.05"
Size Display       → Shows current size (e.g., "0.4")
[+] Button         → Increase size by 0.05"
[✓] Toggle Button  → Enable/Disable white validation
```

### Right Box Controls
```
[−] Button         → Decrease size by 0.05"
Size Display       → Shows current size (e.g., "0.4")
[+] Button         → Increase size by 0.05"
(No toggle)        → Always active
```

## Size Reference

| Inches | Pixels | Use Case |
|--------|--------|----------|
| 0.1"   | 96px   | Fine precision measurement |
| 0.15"  | 144px  | Normal usage |
| 0.2"   | 192px  | Standard color sample |
| 0.25"  | 240px  | Larger reference area |
| 0.3"   | 288px  | Generous reference |
| 0.35"  | 336px  | Maximum safe size |
| 0.4"   | 384px  | Default size |

## Voice Messages & When They Play

### During Live Preview (when left box enabled):

```
Condition                          → Voice Alert
─────────────────────────────────────────────────────────
White surface detected             → (No alert - silent confirmation)
Surface too dark (avg < 50 RGB)    → "Too dark to measure reliably"
Surface not white (delta > 30)     → "Please aim the left part of the 
                                     camera view at an even white surface"
```

### Voice Features:
- ✓ Only speaks if `voiceEnabled = true`
- ✓ Respects voice mode setting (family/real/disable)
- ✓ Automatic cooldown: 2 seconds between alerts
- ✓ Prevents repeated alerts for same condition

## Toggle Button States

### Left Box (✓/⊘ Button)

```
┌─────────────────┐
│  [✓] ENABLED    │  ← Green/Blue button
└─────────────────┘     - Actively validating
                        - Voice alerts active
                        - Warning displays on
                        - Box opaque (full visibility)

         ↓ (tap button)

┌─────────────────┐
│  [⊘] DISABLED   │  ← Red/Dark button
└─────────────────┘     - No validation
                        - No voice alerts
                        - No warnings
                        - Box appears grayed out (0.4 opacity)
```

## Step-by-Step Usage

### Initial Setup:
1. Open ColorLens Color Detector screen
2. Reference boxes appear at bottom (left & right)
3. Both boxes default to 0.4" × 0.4"
4. Left box toggle is enabled ([✓])

### Preparing for Measurement:
1. Place white paper in front of left box
2. Listen for voice confirmation or alert
3. Adjust camera angle if needed
4. Continue until no warning voice

### Taking Measurement:
1. Place color sample in right box
2. The camera will detect color
3. Results appear in info panel below

### Fine-Tuning:
1. Use +/− buttons to resize boxes for precision
2. Smaller boxes (0.1-0.2") = more precise
3. Larger boxes (0.3-0.4") = easier alignment

### Disabling White Reference (Optional):
1. Tap the [✓] toggle button
2. Box becomes [⊘] (disabled)
3. No white balance validation
4. Useful if white paper unavailable

## Color Accuracy Tips

✓ **Better Accuracy:**
- Use bright white paper (not cream or off-white)
- Ensure even lighting across white reference
- Resize boxes small (0.1-0.2") for precision
- Keep camera at consistent angle

✗ **Lower Accuracy:**
- Using colored or tinted paper
- Uneven lighting (shadows on white paper)
- Too dark environment
- Moving camera rapidly

## Keyboard/Touch Controls

| Action | Touch |
|--------|-------|
| Decrease left box size | Tap [−] under left box |
| Increase left box size | Tap [+] under left box |
| Toggle white reference | Tap [✓]/[⊘] button |
| Decrease right box size | Tap [−] under right box |
| Increase right box size | Tap [+] under right box |
| Freeze frame | Tap "Freeze Frame" button (below) |
| Unfreeze frame | Tap "Unfreeze" button (below) |

## Status Indicators

```
During Live Preview:
├─ No warnings shown       → White surface is VALID ✓
├─ Red warning banner      → White surface is INVALID ✗
│  ├─ "Too dark..."        → Lighting too low
│  └─ "Please aim..."      → Surface not white
└─ Voice playing           → Alert message being spoken

Voice Output:
├─ Cooldown active (gray)  → Wait 2 seconds for next alert
└─ Ready to speak          → Will alert if condition changes
```

## Settings Integration

Reference boxes respect these settings:
- `voiceEnabled`: Controls voice alerts
- `voiceMode`: Determines what's spoken
  - 'family' → Color family names
  - 'real' → Real color names
  - 'disable' → No voice

## Common Scenarios

### Scenario 1: "Too dark to measure reliably"
**Problem**: Low lighting
**Solution**:
- Move to brighter location
- Increase room lighting
- Use device flashlight
- Resize boxes smaller for light concentration

### Scenario 2: "Please aim the left part at white surface"
**Problem**: Surface not pure white
**Solution**:
- Use white printer paper (not cream)
- Clean paper surface
- Ensure no shadows
- Aim directly (perpendicular angle)

### Scenario 3: Want precise small area measurement
**Solution**:
- Tap [−] multiple times to shrink boxes to 0.1"
- Align camera precisely over target
- Smaller boxes = higher precision

### Scenario 4: Can't use white reference
**Solution**:
- Tap [⊘] to disable left box
- Right box still measures color
- Less accurate but functional

---

## Visual States Summary

```
┌──────────────────────────────────────┐
│  STATE: READY (normal operation)    │
├──────────────────────────────────────┤
│  Left Box:  [Opaque] [✓] Enabled    │
│  Right Box: [Opaque] Always On      │
│  Warning:  None                     │
│  Voice:    Ready to alert           │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  STATE: INVALID WHITE SURFACE       │
├──────────────────────────────────────┤
│  Left Box:  [Opaque] [✓] Enabled    │
│  Right Box: [Opaque] Always On      │
│  Warning:  ⚠️ "Please aim..." RED   │
│  Voice:    Speaking alert           │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  STATE: WHITE BOX DISABLED           │
├──────────────────────────────────────┤
│  Left Box:  [Faded] [⊘] Disabled    │
│  Right Box: [Opaque] Always On      │
│  Warning:  None                     │
│  Voice:    Silent (no validation)   │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  STATE: FROZEN (size adjustment)    │
├──────────────────────────────────────┤
│  Boxes:    Hidden (only on live)    │
│  Center:   Crosshair only           │
│  Info:     Shows last measurement   │
└──────────────────────────────────────┘
```

---

**This layout matches the Color Meter app's interface while maintaining ColorLens's design aesthetic.**

Version: 1.0
Last Updated: November 2025
