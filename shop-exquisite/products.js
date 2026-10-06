// ============================================================
//  PRODUCTS — edit stock here.
//  sizes: { "M": 3 } means 3 units of size M in stock. 0 = sold out.
//  Prices come from the Shop Exquisite Instagram: shirts J$10,000,
//  pants J$10,000, shoes J$15,000. Stock numbers are placeholders.
// ============================================================
window.PRODUCTS = [
  { id: "tee-001", name: "Charcoal Cross Tee", category: "Tees", price: 10000, isNew: true,
    image: "img/tee-charcoal.jpg",
    desc: "Heavyweight washed charcoal tee with embroidered cross detailing and a relaxed, boxy fit.",
    sizes: { S: 2, M: 4, L: 3, XL: 1, XXL: 0 } },
  { id: "tee-002", name: "Black Arrow Graphic Tee", category: "Tees", price: 10000, isNew: true,
    image: "img/tee-black.jpg",
    desc: "Oversized black tee with a bold hand-painted arrow graphic across the back.",
    sizes: { S: 0, M: 3, L: 5, XL: 2, XXL: 2 } },
  { id: "pnt-001", name: "Distressed Skinny Jeans", category: "Pants", price: 10000, isNew: true,
    image: "img/jeans.jpg",
    desc: "Washed sand-blue skinny fit with distressing and a slight stretch.",
    sizes: { "30": 2, "32": 4, "34": 3, "36": 0, "38": 1 } },
  { id: "shoe-001", name: "Triple White Low-Top Sneakers", category: "Shoes", price: 15000, isNew: false,
    image: "img/sneakers.jpg",
    desc: "Clean all-white leather low-tops that go with everything.",
    sizes: { "8": 0, "9": 2, "10": 3, "11": 2, "12": 0 } }
];
