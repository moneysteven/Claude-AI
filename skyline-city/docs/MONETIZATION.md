# Gamepasses and developer products — Creator Dashboard setup

You need a **published** experience (Studio → File → Publish to Roblox).

## A. Create the 4 gamepasses

1. Go to https://create.roblox.com/dashboard/creations and click your experience.
2. Left menu: **Monetization → Passes → Create a Pass**.
3. For each pass, upload a 512×512 icon, enter the name and description, then **Create Pass**.
4. Open the pass, go to **Sales**, turn **Item for Sale** on, set the price and **Save**.
5. Copy the **Pass ID**. It's the number in the URL, or use the "⋯" menu → *Copy Asset ID*.

| Key in config | Name | Price | Description to paste |
|---|---|---|---|
| `VIP` | VIP Membership | 200 R$ | VIP name tag & gold chat, 2x paychecks, daily VIP cash bonus, VIP lounge & club, VIP-only cars & colours, free premium parking spot, priority job slots, 20% off furniture, extra build space, VIP badge. |
| `ExclusiveApartments` | Exclusive Apartments | 100 R$ | Unlock luxury Sky Apartments with city views and a private elevator. |
| `PremiumCarPark` | Premium Car Park | 300 R$ | Private garage with extra car slots, a showroom display, instant car spawn anywhere and exclusive paints. |
| `ExtraHouse` | Extra House / Extra Floor | 99 R$ | Own a second house and add an extra floor in build mode. |

6. Open `src/shared/Config/Monetization.luau` and paste each Pass ID into its `Id = 0` field.

## B. Create the developer products (clothing and accessories)

1. Same experience → **Monetization → Developer Products → Create a Developer Product**.
2. Create one product per exclusive item listed in `Config/Monetization.luau` (Products section). Prices are 49–99 R$: designer outfits, chains, watches, sunglasses, sneakers, plus any cosmetic consumables.
3. Copy each **Product ID** into the matching `Id = 0` field.

> Developer products can be bought again and again. The game stores every processed `PurchaseId` in the player's save **and** in a global receipts store. A purchase is only acknowledged (`PurchaseGranted`) after the save succeeds, so a purchase is never lost and never granted twice. If an item is already owned, buying it again tells the player and doesn't grant a duplicate.

## C. VIP badge (optional)

**Engagement → Badges → Create a Badge**, then paste its ID into `Config/Monetization.luau` → `VipBadgeId`.

## D. Test

- In Studio with `TestMode = true` and IDs left at 0, the Shop shows **Simulate purchase (Studio)**. That button only exists in Studio, never live.
- With real IDs, Studio shows the real purchase dialog but no Robux is charged (test purchases).
- Before publishing, set `TestMode = false`.

## Fairness rules (keep them)

Robux buys **perks and style**: VIP's 2x pay, a discount, cosmetics, convenience. It never sells cash packs or unbeatable stats. Every house tier except Sky Apartments and every non-VIP car can be earned with cash.
