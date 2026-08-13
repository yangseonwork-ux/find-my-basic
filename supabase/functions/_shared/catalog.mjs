export const serverProducts = Object.freeze([
  { id: "airy-cotton-blouse", name: "Airy Cotton Blouse", brand: "FORM", price: 49000 },
  { id: "soft-square-neck-tee", name: "Soft Square Neck Tee", brand: "MORROW", price: 35000 },
  { id: "linen-sleeveless-top", name: "Linen Sleeveless Top", brand: "AVEN", price: 52000 },
  { id: "sheer-summer-shirt", name: "Sheer Summer Shirt", brand: "NOOK", price: 59000 },
  { id: "essential-cap-sleeve-knit", name: "Essential Cap Sleeve Knit", brand: "PLAINSET", price: 45000 },
  { id: "airy-wide-pants", name: "Airy Wide Pants", brand: "FORM", price: 75000 },
  { id: "pleated-midi-skirt", name: "Pleated Midi Skirt", brand: "AVEN", price: 72000 },
  { id: "linen-straight-trousers", name: "Linen Straight Trousers", brand: "TAPER", price: 69000 },
  { id: "clean-bermuda-shorts", name: "Clean Bermuda Shorts", brand: "LOAM", price: 55000 },
  { id: "fluid-a-line-skirt", name: "Fluid A-Line Skirt", brand: "MORROW", price: 68000 },
  { id: "sheer-knit-cardigan", name: "Sheer Knit Cardigan", brand: "MORROW", price: 58000 },
  { id: "cropped-linen-jacket", name: "Cropped Linen Jacket", brand: "FORM", price: 89000 },
  { id: "light-bolero-cardigan", name: "Light Bolero Cardigan", brand: "AVEN", price: 62000 },
  { id: "airy-shirt-jacket", name: "Airy Shirt Jacket", brand: "NOOK", price: 69000 },
  { id: "summer-mesh-cardigan", name: "Summer Mesh Cardigan", brand: "PLAINSET", price: 65000 },
  { id: "minimal-strap-sandal", name: "Minimal Strap Sandal", brand: "FORM", price: 79000 },
  { id: "mesh-ballet-flat", name: "Mesh Ballet Flat", brand: "AVEN", price: 85000 },
  { id: "slim-slingback-flat", name: "Slim Slingback Flat", brand: "MORROW", price: 89000 },
  { id: "clean-summer-sneaker", name: "Clean Summer Sneaker", brand: "PLAINSET", price: 92000 },
  { id: "square-toe-sandal", name: "Square Toe Sandal", brand: "TAPER", price: 82000 },
]);

export const serverProductById = new Map(serverProducts.map((product) => [product.id, product]));
