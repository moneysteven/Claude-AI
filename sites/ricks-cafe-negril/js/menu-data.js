/* Rick's Cafe — official menu, Revision 26.03, ©2026 Rick's Cafe Jamaica (assets/docs/ricks-cafe-menu-rev-26-03.pdf).
   EDIT ME when the menu changes. Prices are USD exactly as printed; they exclude GCT and the 10% service charge.
   n = name, p = price, d = description (as printed; obvious typos noted in content/business.json), star = printed asterisk,
   t = tags from the printed icons/labels: chef (Chef Specialty hat), spicy (Spicy Mon pepper), season (lobster season),
   super ("Supersize" printed), special ("Rick's Anniversary Special" printed).
   "Chef Specialty" and "Spicy Mon" are the menu's icon legend, not dishes. */
window.MENU = [
  { id: 'starters', title: 'Starters', items: [
    { n: 'Crispy Fried Calamari', p: '$20', d: 'Served with Asian aioli.' },
    { n: 'Chicken Wings', p: '$20', d: '8 pieces, choice of Naked, Buffalo or Sesame BBQ. Served with blue cheese, carrot and celery sprinkles.', t: ['chef', 'spicy'] },
    { n: 'Jerked Chicken Kabobs', p: '$20', star: 1, d: 'Chunks of chicken breast, onion and bell pepper marinated in jerk spices, slow grilled and drizzled with jerk sauce.' },
    { n: 'Red Stripe Beer Battered Shrimp', p: '$20', d: 'Tender shrimp seasoned and fried, served with Yum Yum sauce.', t: ['chef'] },
    { n: 'Peppered Shrimp', p: '$20', star: 1, d: 'A South Coast favorite. Whole head-and-shell-on shrimp simmered in a Scotch bonnet, herbs and spices broth. Peel and eat.', t: ['spicy'] },
    { n: 'Rick Inspired Oxtail Mac & Cheese Balls', p: '$22', d: 'Printed directly beneath this dish: <em>Choice of French fries or onion rings.</em>' }
  ] },
  { id: 'pasta', title: 'Pasta', items: [
    { n: 'Cajun Shrimp', p: '$33', d: 'Sautéed and simmered in a mushroom and basil cream sauce, tossed with penne pasta and Parmesan cheese.' },
    { n: 'Jerk Chicken', p: '$30', d: 'Chicken tossed with bell peppers and onions, simmered in a coconut-flavored cream sauce and served over penne pasta.' },
    { n: 'Ital', p: '$22', d: 'Influenced by our Rastafarian culture. Roasted seasoned local vegetables, herbs and spices simmered in a coconut rundown sauce, tossed with penne pasta.' }
  ] },
  { id: 'entrees', title: 'Entrées', chip: 'Entrées', after: 'All above entrées are served with your choice of one side: onion rings, French fries or rice and peas.', items: [
    { n: 'Nifty 50 Escovitch Snapper Fillet', p: '$28', d: 'Lightly breaded, fried to perfection and topped with pickled onions, hot peppers and carrots.', t: ['special', 'spicy'] },
    { n: "Rick's Caribbean Whole Lobster", p: '$45', star: 1, d: 'Drizzled with citrus garlic butter and flame grilled to perfection. Served only from July 1 to March 31, in support of Jamaica’s conservation efforts.', t: ['chef', 'season'] },
    { n: 'Salmon Fillet', p: '$35', star: 1, d: 'Pan seared and drizzled with a citrus sweet chili glaze.' },
    { n: 'Blackened Mahi Mahi Fillet', p: '$32', star: 1, d: 'Served with citrus herb butter.', t: ['chef'] },
    { n: 'Jamaican Steamed Fish and Shrimp with Okra', p: '$33', star: 1, d: 'Caribbean snapper fillet, jumbo shrimp and vegetables simmered in a light coconut sauce.' },
    { n: 'Jerk Chicken', p: '$26', star: 1, d: 'Marinated in jerk spices and slow cooked.' },
    { n: 'New York Strip Steak', p: '$48', star: 1, d: 'Seasoned and grilled to desired temperature, topped with Rick’s red wine, onion and mushroom reduction.' },
    { n: 'Rum BBQ Spare Ribs', p: '$37', star: 1, d: 'Slow cooked pork ribs, drenched in our homemade rum BBQ sauce.' },
    { n: 'Jamaican Style Braised Oxtail and Broad Beans', p: '$32' }
  ] },
  { id: 'salads', title: 'Salads', items: [
    { n: 'Mixed Garden', p: '$17', star: 1, d: 'Iceberg lettuce, tomato wedges, red onion, shaved carrot, cucumber. Choice of Ranch, Blue Cheese or Mango Vinaigrette dressing.' },
    { n: 'Add grilled shrimp', p: '$13' },
    { n: 'Add jerk chicken', p: '$8' },
    { n: 'Add blackened mahi mahi', p: '$10' }
  ] },
  { id: 'desserts', title: 'Jamaican Desserts', chip: 'Desserts', items: [
    { n: 'Traditional Rum Cake', p: '$10', d: 'Infused with Jamaican rum and served with a side of vanilla ice cream.' },
    { n: 'Banana Bread', p: '$9', d: 'Our version of English sticky pudding. Add ice cream for $4.' },
    { n: 'Sweet Potato Pudding', p: '$9', d: 'A Jamaican traditional treat served warm. Add ice cream for $4.' }
  ] },
  { id: 'beer-blast', title: 'Beer Blast', items: [
    { n: 'Beer Blast', p: '$30', d: '5 Red Stripes + 5 test tube shots.' }
  ] },
  { id: 'mating-season', title: 'Mating Season', note: 'Cocktail names as printed on the menu. All cocktails contain alcohol.', items: [
    { n: 'For Her: Sex with Rick', p: '$14', d: 'Vodka, peach schnapps, OJ, cranberry juice, pineapple juice & a splash of cream… <em>We’ll respect you in the morning.</em>', t: ['super'] },
    { n: 'For Him: Front End Lifter a.k.a. Jamaican Viagra', p: '$14', d: 'Blended stout beer, white rum, rum cream, clear syrup & oatmeal topped with chocolate syrup… <em>True story.</em>' }
  ] },
  { id: 'specials', title: 'Drink Specials', chip: 'Drink specials', note: 'All contain alcohol.', items: [
    { n: 'The Big Five O', p: '$14', d: 'Appleton rum, dark rum, orange juice, lime juice & mango juice. <em>This drink will blow you away.</em>', t: ['special', 'super'] },
    { n: 'Sunset Green Flash', p: '$14', d: 'White rum, coconut rum, melon liqueur, pineapple juice & orange juice. <em>Don’t miss the sunset mon!</em>', t: ['super'] },
    { n: 'Rick’s World Famous Rum Punch', p: '$12', d: 'A concoction of rum and fruit juices… <em>A way of life here mon!</em> Featured in Alan Gage’s “Around the World in 80 Bars”.', t: ['super'] },
    { n: 'Rick’s Cliffside Cooler', p: '$14', d: 'Appleton rum, margarita mix, OJ, cranberry juice & a splash of ginger ale on top.', t: ['super'] },
    { n: 'Jamaican Me Crazy', p: '$14', d: 'Three types of rum, banana liqueur & pineapple juice… <em>Skinny dipping soon come.</em>', t: ['super'] },
    { n: 'Shark Bite', p: '$14', d: 'Blue Curaçao, Coruba Dark, OJ, grenadine and a garnish of pineapple. <em>You’re gonna need a bigger boat…</em>' },
    { n: 'Rick’s Frozen Rum Runner', p: '$14', d: 'Blended white rum, blackberry brandy, banana liqueur, pineapple juice, grenadine & lime juice.' },
    { n: 'Frozen Bob Marley', p: '$14', d: 'Blended with Appleton rum, strawberry, mango & Blue Curaçao.' },
    { n: 'Beergarita', p: '$20', d: 'White rum, Triple Sec, Blue Curaçao. Served frozen with a Red Stripe Light. <em>32 ounces of fun!</em>' }
  ] },
  { id: 'tropitinis', title: 'Jamaican Tropitinis', chip: 'Tropitinis', note: 'All contain alcohol.', items: [
    { n: 'Apples & Oranges', p: '$16', d: 'Orange vodka, Apple Pucker & cranberry juice.' },
    { n: 'Clementine Martini', p: '$16', d: 'Vodka, gin, coconut rum, Apple Pucker & OJ.' },
    { n: 'Rasta-politan', p: '$16', d: 'Vodka, Triple Sec, cranberry juice & a squeeze of lime.' },
    { n: 'Day Dream Martini', p: '$16', d: 'Citrus vodka, OJ, Triple Sec & syrup.' },
    { n: 'Frenchie Martini', p: '$16', d: 'Citrus vodka, Chambord & pineapple juice.' }
  ] },
  { id: 'beers', title: 'Well Cold Beers', chip: 'Beers', items: [
    { n: 'Red Stripe Bottle', p: '$6' }, { n: 'Red Stripe Draft', p: '$5' }, { n: 'Red Stripe Light', p: '$6' },
    { n: 'Guinness', p: '$7' }, { n: 'Smirnoff Ice', p: '$7' }, { n: 'Dragon Stout', p: '$7' },
    { n: 'Heineken', p: '$7' }, { n: 'Heineken Silver', p: '$7' }, { n: 'Heineken Zero', p: '$5' },
    { n: 'Corona', p: '$7' }, { n: 'Miller Lite', p: '$6' }, { n: 'Stella Artois', p: '$7' },
    { n: 'Rum Stripe', p: '$6', d: 'Jamaican rum blended with cranberry, or Jamaican rum blended with coconut & pineapple.' },
    { n: 'Rick’s Clubhouse IPA', p: '$9', d: 'Jamaican craft brewed.' }
  ] },
  { id: 'bottles', title: 'Bottle Service', chip: 'Bottle service', after: 'Make your own drinks. Any two mixers of your choice will be provided.', items: [
    { n: 'Appleton Special', p: '$80' }, { n: 'Appleton VX', p: '$95' }, { n: 'Absolut', p: '$90' },
    { n: 'Grey Goose', p: '$175' }, { n: 'Hennessy VS', p: '$200' }, { n: 'Hennessy VSOP', p: '$250' },
    { n: 'Courvoisier', p: '$200' }, { n: 'Moët & Chandon', p: '$220' }, { n: 'Dom Pérignon', p: '$385' }
  ] }
];
