# Cart Flow Type Missing Incident Report

> **Date:** December 25, 2025  
> **BI Event:** `17:1241` (cart_page_load_start)  
> **Affected Parameter:** `cart_flow_type`  
> **Repository:** [wix-private/premium-cart](https://github.com/wix-private/premium-cart)

---

## TL;DR

**The standalone cart (`PremiumCartPurchaseFlow`) does not pass `predefinedFlowName` to the `InfraCartModule.Provider` context**, causing `cart_flow_type` to default to `'unknown'` in BI event 17:1241 when users navigate directly to `/cart/review`.

### Impact
- Any user navigating to cart via direct URL (without `referrer` query param) sends `cart_flow_type: 'unknown'`
- This breaks BI analytics for cart flow attribution
- Cannot distinguish standalone cart flows from other entry points

### Root Cause
```tsx
// packages/premium-purchase-flow/src/app/index.tsx
export const PremiumCartPurchaseFlow = () => {
  return (
    <InfraCartModule.Provider
      translations={{ Loading: <></> }}
      // ❌ MISSING: context={{ predefinedFlowName: 'domainsUpsell' }}
    >
      <CartRouter />
    </InfraCartModule.Provider>
  );
};
```

---

## Flow Explanation

### 1. Entry Point: Standalone Cart

When a user navigates to `https://manage.wix.com/cart/review?msid=xxx`:

**File:** [`packages/premium-cart-standalone/src/app/app.tsx`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-standalone/src/app/app.tsx)

```tsx
export const CartStandalone = () => {
  // ...
  return (
    <PremiumEssentialsProvider /* ... */>
      <PremiumCartPurchaseFlow />  // 👈 Uses this component
    </PremiumEssentialsProvider>
  );
};
```

### 2. PremiumCartPurchaseFlow - Missing Context

**File:** [`packages/premium-purchase-flow/src/app/index.tsx`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-purchase-flow/src/app/index.tsx)

```tsx
export const PremiumCartPurchaseFlow = () => {
  return (
    <InfraCartModule.Provider
      translations={{ Loading: <></> }}
      // ❌ NO context prop - predefinedFlowName NOT SET
    >
      <CartRouter />
    </InfraCartModule.Provider>
  );
};
```

**Compare with working Editor Flow:**

**File:** [`packages/premium-funnel-flow/src/components/flows/EditorFlow/editor-configurations/cart-editor.configuration.tsx`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-funnel-flow/src/components/flows/EditorFlow/editor-configurations/cart-editor.configuration.tsx)

```tsx
<InfraCartModule.Provider
  translations={{ Loading: <></> }}
  context={{
    predefinedFlowName: 'domainsUpsell',  // ✅ Sets the flow type
  }}
>
```

### 3. Context Default Value

**File:** [`packages/premium-cart-platform/src/platform/modules/infra-cart-module/infra-cart.module.tsx`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/modules/infra-cart-module/infra-cart.module.tsx)

```tsx
export const InfraCartModule = createPremiumModule(
  'infra-cart-module',
  [
    ModuleExtensions.contextExtension({
      predefinedFlowName: null,  // 👈 Default is null
    }),
  ],
  // ...
);
```

### 4. Flow Detection Logic

**File:** [`packages/premium-cart-platform/src/platform/hooks/useFlows/useFlows.ts`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/hooks/useFlows/useFlows.ts)

```tsx
export const useFlows = (): Flows => {
  const { referrer } = useQueryParams();  // Gets 'referrer' from URL

  // These require specific referrer values in URL
  const isDomainBrandProtection =
    (experiments['specs.premium.DomainsBundle'] &&
      referrer?.toLowerCase() === 'domainbrandprotection') ||
    isDomainBundleAndSave;

  const isDomainUpSell =
    experiments['specs.premium.domainUpSell'] &&
    referrer?.toLowerCase() === 'domainsupsell';

  return { isDomainBrandProtection, isDomainUpSell, /* ... */ };
};
```

### 5. BI Flow Name Determination

**File:** [`packages/premium-cart-platform/src/platform/hooks/useFlows/useFlowName.tsx`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/hooks/useFlows/useFlowName.tsx)

```tsx
export const useBiFlowName = () => {
  const { isDomainUpSell, isDomainBrandProtection } = useFlows();
  const predefinedLayoutOverride =
    InfraCartModule.internals.useContext().predefinedFlowName;  // = null

  const flowName = isDomainUpSell                           // false
    ? constants.CartFlows.DomainUpSell
    : isDomainBrandProtection                                // false
    ? constants.CartFlows.DomainBundle
    : predefinedLayoutOverride === 'businessEmailWithDomain' // null ≠ string
    ? constants.CartFlows.BusinessEmailWithDomain
    : predefinedLayoutOverride === 'domainsUpsell'           // null ≠ string
    ? constants.CartFlows.CartStandalone
    : 'unknown';  // 👈 FALLS THROUGH TO HERE

  return flowName;
};
```

### 6. BI Logger Usage

**File:** [`packages/premium-cart-platform/src/platform/hooks/useBILogger/useBILogger.ts`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/hooks/useBILogger/useBILogger.ts)

```tsx
export const useBILogger = () => {
  const cartFlowType = PremiumCartModule.internals.hooks.useBiFlowName();  // = 'unknown'

  biLogger?.updateDefaults({
    cartFlowType,  // Sets 'unknown' as default for ALL BI events
  });
  // ...
};
```

### 7. CartFlows Constants

**File:** [`packages/premium-cart-common/src/constants/flows.ts`](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-common/src/constants/flows.ts)

```tsx
export const CartFlows = {
  CartStandalone: 'megaFunnel',
  DomainBundle: 'domainBundle',
  DomainUpSell: 'domainUpsell',
  BusinessEmailWithDomain: 'businessEmailWithDomain',
  Unknown: 'unknown',  // 👈 The value being sent
} as const;
```

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  URL: https://manage.wix.com/cart/review?msid=xxx                       │
│  (No 'referrer' query param)                                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  CartStandalone (app.tsx)                                               │
│  └── <PremiumCartPurchaseFlow />                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PremiumCartPurchaseFlow (index.tsx)                                    │
│  └── <InfraCartModule.Provider>                                         │
│      └── ❌ NO context={{ predefinedFlowName }} prop                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  InfraCartModule context:                                               │
│  predefinedFlowName = null (default)                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  useFlows():                                                            │
│  • referrer = undefined (not in URL)                                    │
│  • isDomainUpSell = false                                               │
│  • isDomainBrandProtection = false                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  useBiFlowName():                                                       │
│  1. isDomainUpSell? ❌ NO                                               │
│  2. isDomainBrandProtection? ❌ NO                                      │
│  3. predefinedFlowName === 'businessEmailWithDomain'? ❌ NO (null)      │
│  4. predefinedFlowName === 'domainsUpsell'? ❌ NO (null)                │
│  5. Default → 'unknown' ✓                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  useBILogger():                                                         │
│  biLogger.updateDefaults({ cartFlowType: 'unknown' })                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BI Event 17:1241 (cart_page_load_start):                               │
│  { cart_flow_type: 'unknown', msid: 'xxx', ... }                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Suggested Fix

### Option 1: Set Default Flow for Standalone Cart (Recommended)

Update `PremiumCartPurchaseFlow` to default to `'megaFunnel'` (CartStandalone):

**File:** `packages/premium-purchase-flow/src/app/index.tsx`

```tsx
import React from 'react';
import { CartRouter } from '../components/cart-router/Router';
import { InfraCartModule } from '@wix/premium-cart-platform';

export const PremiumCartPurchaseFlow = () => {
  return (
    <InfraCartModule.Provider
      translations={{
        Loading: <></>,
      }}
      context={{
        predefinedFlowName: 'domainsUpsell',  // ✅ ADD THIS - maps to 'megaFunnel'
      }}
    >
      <CartRouter />
    </InfraCartModule.Provider>
  );
};
```

### Option 2: Accept Flow Name as Prop

Make the flow name configurable for different consumers:

```tsx
import React from 'react';
import { CartRouter } from '../components/cart-router/Router';
import { InfraCartModule, TPredefinedFlowName } from '@wix/premium-cart-platform';

interface PremiumCartPurchaseFlowProps {
  flowName?: TPredefinedFlowName;
}

export const PremiumCartPurchaseFlow = ({ 
  flowName = 'domainsUpsell'  // Default for standalone
}: PremiumCartPurchaseFlowProps) => {
  return (
    <InfraCartModule.Provider
      translations={{
        Loading: <></>,
      }}
      context={{
        predefinedFlowName: flowName,
      }}
    >
      <CartRouter />
    </InfraCartModule.Provider>
  );
};
```

### Option 3: Derive Flow from URL (More Dynamic)

Read the `referrer` param and derive the flow name:

```tsx
import React, { useMemo } from 'react';
import { CartRouter } from '../components/cart-router/Router';
import { InfraCartModule, TPredefinedFlowName } from '@wix/premium-cart-platform';

const getFlowFromUrl = (): TPredefinedFlowName | null => {
  const params = new URLSearchParams(window.location.search);
  const referrer = params.get('referrer')?.toLowerCase();
  
  switch (referrer) {
    case 'domainsupsell':
      return 'domainsUpsell';
    case 'domainbrandprotection':
      return 'brandProtection';
    case 'businessemailwithdomain':
      return 'businessEmailWithDomain';
    default:
      return 'domainsUpsell';  // Default to standalone cart flow
  }
};

export const PremiumCartPurchaseFlow = () => {
  const flowName = useMemo(() => getFlowFromUrl(), []);

  return (
    <InfraCartModule.Provider
      translations={{
        Loading: <></>,
      }}
      context={{
        predefinedFlowName: flowName,
      }}
    >
      <CartRouter />
    </InfraCartModule.Provider>
  );
};
```

### Option 4: Update `useBiFlowName` Default (Quick Fix)

If you want to minimize changes, update the default in `useBiFlowName`:

**File:** `packages/premium-cart-platform/src/platform/hooks/useFlows/useFlowName.tsx`

```tsx
export const useBiFlowName = () => {
  const { isDomainUpSell, isDomainBrandProtection } = useFlows();
  const predefinedLayoutOverride =
    InfraCartModule.internals.useContext().predefinedFlowName;

  const flowName = isDomainUpSell
    ? constants.CartFlows.DomainUpSell
    : isDomainBrandProtection
    ? constants.CartFlows.DomainBundle
    : predefinedLayoutOverride === 'businessEmailWithDomain'
    ? constants.CartFlows.BusinessEmailWithDomain
    : predefinedLayoutOverride === 'domainsUpsell'
    ? constants.CartFlows.CartStandalone
    : constants.CartFlows.CartStandalone;  // ✅ Change from 'unknown' to CartStandalone

  return flowName;
};
```

⚠️ **Note:** This option changes the default behavior for ALL cases where flow is not set, which might mask other issues.

---

## Recommendation

**Use Option 1** (set default in `PremiumCartPurchaseFlow`) as it:
- Is minimal change (1 line)
- Fixes the issue at the source
- Maintains backward compatibility
- Doesn't require changes to other consumers

---

## Validation

After implementing the fix, verify by:

1. Navigate to `https://manage.wix.com/cart/review?msid=xxx` (no referrer)
2. Check BI event 17:1241 in network tab
3. Confirm `cart_flow_type` is `'megaFunnel'` instead of `'unknown'`

Update the existing test to reflect new expected behavior:

**File:** `packages/premium-cart-platform/src/platform/pages/cart-review/components/CartLoadBiStart/CartLoadBiStart.spec.tsx`

```tsx
expect(
  biTestKit.premiumCartCartPageLoadStartSrc17Evid1241.last(),
).toEqual(
  expect.objectContaining({
    cartFlowType: constants.CartFlows.CartStandalone,  // Change from Unknown
    // ...
  }),
);
```

---

## References

| File | Link |
|------|------|
| PremiumCartPurchaseFlow | [premium-purchase-flow/src/app/index.tsx](https://github.com/wix-private/premium-cart/blob/master/packages/premium-purchase-flow/src/app/index.tsx) |
| InfraCartModule | [infra-cart-module/infra-cart.module.tsx](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/modules/infra-cart-module/infra-cart.module.tsx) |
| useBiFlowName | [useFlows/useFlowName.tsx](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/hooks/useFlows/useFlowName.tsx) |
| useFlows | [useFlows/useFlows.ts](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/hooks/useFlows/useFlows.ts) |
| useBILogger | [useBILogger/useBILogger.ts](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/hooks/useBILogger/useBILogger.ts) |
| CartFlows constants | [constants/flows.ts](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-common/src/constants/flows.ts) |
| CartLoadBiStart test | [CartLoadBiStart.spec.tsx](https://github.com/wix-private/premium-cart/blob/master/packages/premium-cart-platform/src/platform/pages/cart-review/components/CartLoadBiStart/CartLoadBiStart.spec.tsx) |
| Working example (Editor) | [cart-editor.configuration.tsx](https://github.com/wix-private/premium-cart/blob/master/packages/premium-funnel-flow/src/components/flows/EditorFlow/editor-configurations/cart-editor.configuration.tsx) |

