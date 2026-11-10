/* PINTOU, GANHOU! — itens (comidas e bebidas).
 * Linha: "nome pt|name en|HEX principal|HEX secundária (opcional)|forma (opcional)"
 * "#id|Categoria|Category|forma padrão" abre uma categoria. Cores = cor típica real do item. */
export const DATA_A = `
#fruit|Frutas|Fruits|apple
Banana madura|Ripe banana|F3D03E|6B4A1E|banana
Banana verde|Green banana|A8C256|5A6B2A|banana
Banana passada|Overripe banana|D9A93A|4A3218|banana
Maçã vermelha|Red apple|C0202A||apple
Maçã verde|Green apple|8DC63F||apple
Maçã amarela|Yellow apple|E8D44D||apple
Maçã gala|Gala apple|D8483A||apple
Pera verde|Green pear|C9D65A||pear
Pera williams madura|Ripe Williams pear|DCC659||pear
Pera-asiática|Asian pear|D9B573||pear
Laranja|Orange|F28C1C||orange
Tangerina|Tangerine|F57F17||orange
Laranja-lima|Sweet orange|F2A93A||orange
Limão-taiti|Lime|6FA83A||lemon
Limão-siciliano|Lemon|F5E050||lemon
Lima-da-pérsia|Sweet lime|D7DC6A||lemon
Uva roxa|Purple grapes|5B2A5E||grapes
Uva verde|Green grapes|B5C95A||grapes
Uva rubi|Red grapes|9E2A4A||grapes
Morango|Strawberry|D7263D||berry
Framboesa|Raspberry|C4224F||berry
Amora|Blackberry|2E1A33||berry
Mirtilo|Blueberry|4F5D95||orange
Cereja|Cherry|9E1B32||cherry
Acerola|Acerola|D3242F||cherry
Pitanga|Surinam cherry|D8361E||orange
Melancia (polpa)|Watermelon flesh|F2545B|3D8B3D|melon
Melão-cantalupe (polpa)|Cantaloupe flesh|F5A65B|C9B98A|melon
Melão amarelo (polpa)|Honeydew-yellow melon flesh|F2E2A2|E8C82A|melon
Mamão (polpa)|Papaya flesh|F5823E|F2B63A|melon
Manga madura|Ripe mango|F6B33C||mango
Manga verde|Green mango|7CA63A||mango
Manga (polpa)|Mango flesh|FFB52E||slice
Abacate (casca)|Avocado skin|3E5A1E||pear
Abacate (polpa)|Avocado flesh|C9D57A|3E5A1E|slice
Kiwi (polpa)|Kiwi flesh|8DB33A|7A5A3A|slice
Kiwi (casca)|Kiwi skin|8A6A42||potato
Pêssego|Peach|F5A36B||orange
Damasco|Apricot|F4A340||orange
Ameixa|Plum|5E2550||orange
Nectarina|Nectarine|D8503A||orange
Figo (polpa)|Fig flesh|B8405A|5A3A4A|slice
Maracujá (casca)|Passion fruit|5B2C4A||orange
Maracujá amarelo|Yellow passion fruit|E8C43A||orange
Goiaba vermelha (polpa)|Red guava flesh|F06C6F|B9C64A|slice
Goiaba (casca)|Guava skin|C2CF5A||pear
Abacaxi (polpa)|Pineapple flesh|F5D547|C9A84A|slice
Abacaxi (casca)|Pineapple skin|C8962E|3E8E2A|pineapple
Coco (casca)|Coconut shell|6B4A2E||orange
Coco verde|Green coconut|7FA23A||orange
Coco (polpa)|Coconut meat|F4F1E8|6B4A2E|slice
Romã|Pomegranate|B0283A||orange
Romã (sementes)|Pomegranate seeds|C21E3A||grapes
Pitaya (casca)|Dragon fruit|E0307A||mango
Pitaya (polpa branca)|White dragon fruit flesh|F4F0EC|E0307A|slice
Lichia|Lychee|C7384A||orange
Caqui|Persimmon|E8701E||orange
Carambola|Starfruit|E9D23A||star
Jabuticaba|Jabuticaba|2A1426||orange
Caju|Cashew apple|E8452B||pear
Toranja (polpa)|Grapefruit flesh|EE6A5A|F2C24A|slice
Cupuaçu (polpa)|Cupuaçu pulp|F2E6C2||bowl
Graviola (polpa)|Soursop flesh|F3F0E4|3E6A2A|slice
Açaí (fruto)|Açaí berry|3B1E3A||grapes
Cajá|Hog plum|F2B21E||mango
Seriguela|Red mombin|D8402E||cherry
Banana-maçã|Apple banana|EBCB55||banana
Pequi (polpa)|Pequi flesh|F6A51E||orange
Tamarindo|Tamarind|7A4A2A||pod
Uva-passa|Raisin|4A2A22||bean
Tâmara|Date|6B3A1E||bean
Groselha|Redcurrant|C8102E||grapes
Mexerica-poncã|Ponkan mandarin|F98B1F||orange

#veg|Legumes e verduras|Vegetables|carrot
Cenoura|Carrot|F08A24||carrot
Tomate maduro|Ripe tomato|E2361F|3E7D2A|tomato
Tomate verde|Green tomato|8DB84A|3E7D2A|tomato
Tomate-cereja amarelo|Yellow cherry tomato|F2C230|3E7D2A|tomato
Pimentão vermelho|Red bell pepper|C8102E||pepper
Pimentão amarelo|Yellow bell pepper|F7C52B||pepper
Pimentão verde|Green bell pepper|3F8C2B||pepper
Pimentão laranja|Orange bell pepper|F2801E||pepper
Pimenta-malagueta|Chili pepper|C41E1E||chili
Pimenta-dedo-de-moça|Red finger pepper|B8221E||chili
Pimenta-jalapeño|Jalapeño|3E7A2A||chili
Pimenta-de-cheiro amarela|Yellow scent pepper|F2C21E||chili
Pepino|Cucumber|3E6B2A||eggplant
Berinjela|Eggplant|3B1F3D||eggplant
Abobrinha|Zucchini|4A7A2E||eggplant
Abóbora-moranga|Pumpkin|E8761C||pumpkin
Abóbora-cabotiá (casca)|Kabocha squash|3E5A3A||pumpkin
Alface|Lettuce|8DC14A||leafy
Alface-roxa|Red lettuce|7A3A4E||leafy
Couve|Collard greens|2E6B30||leaf
Espinafre|Spinach|2F5D2A||leaf
Rúcula|Arugula|3E7A2E||leaf
Repolho roxo|Red cabbage|6B2F6B||leafy
Repolho verde|Green cabbage|A9C77A||leafy
Brócolis|Broccoli|3B6E2E||broccoli
Couve-flor|Cauliflower|EFE8D2|7AA65A|broccoli
Beterraba|Beet|7A1F3D|4E7A2A|onion
Rabanete|Radish|D1344F|4E8A2E|onion
Cebola roxa|Red onion|7A2F5A||onion
Cebola|Onion|D9A55B||onion
Alho|Garlic|EEE6D6||onion
Nabo|Turnip|EEE6EA|8A4A8A|onion
Batata|Potato|C9A06A||potato
Batata-doce|Sweet potato|A0522D||potato
Batata-doce (polpa)|Sweet potato flesh|F2A65A||slice
Mandioca (casca)|Cassava root|6B4A2E||potato
Mandioca (polpa)|Cassava flesh|F3EEDD|6B4A2E|slice
Inhame|Yam|8B6B4E||potato
Gengibre|Ginger|D7B07A||potato
Milho|Corn|F2C53D||corn
Ervilha|Peas|7FB03E||pod
Vagem|Green bean|5E9E3A||pod
Quiabo|Okra|5E8C3A||chili
Cogumelo-paris|Button mushroom|E9E1D3|F2EEE6|mushroom
Shiitake|Shiitake|7A5434|E8DCC8|mushroom
Cogumelo-salmão|Pink oyster mushroom|F2A0A0|F6D0D0|mushroom
Aspargo|Asparagus|7A9E4A||stick
Salsão|Celery|A8C66C||stick
Alcachofra|Artichoke|7A8E4E||leafy
Jiló|Scarlet eggplant|6E9A3E||tomato
Chuchu|Chayote|B9D27A||pear
Maxixe|Gherkin|7AA04A||potato
Palmito|Heart of palm|F2EEDA||stick
Alho-poró|Leek|C8D8A0||stick
Couve-de-bruxelas|Brussels sprout|7AA84A||orange

#food|Comidas|Foods|bowl
Pão francês|French roll|D99A4E||bread
Miolo de pão|Bread crumb|F2E3C0||bread
Pão integral|Wholewheat bread|9C6B3E||bread
Pão de forma torrado|Toast|C98A42||bread
Queijo prato|Mild yellow cheese|F2C14E||cheese
Queijo minas|Fresh white cheese|F4F0E2||cheese
Queijo cheddar|Cheddar|F09A28||cheese
Queijo gorgonzola|Blue cheese|E8E2CC||cheese
Gema de ovo|Egg yolk|F7B32B||yolk
Ovo branco|White egg|F3EFE6||egg
Ovo caipira|Brown egg|C9925E||egg
Ovo de codorna|Quail egg|D8CBB0||egg
Arroz branco|White rice|F5F2EA||bowl
Feijão-preto|Black beans|2B1E1E||bowl
Feijão-carioca|Pinto beans|A9785A||bowl
Molho de tomate|Tomato sauce|B8261C||bowl
Guacamole|Guacamole|8AA63A||bowl
Purê de batata|Mashed potato|F2E2A6||bowl
Macarrão cozido|Cooked pasta|F2D58A||bowl
Salmão cru|Raw salmon|F28A63||steak
Carne crua|Raw beef|B8343A||steak
Bife grelhado|Grilled steak|6B3A26||steak
Atum (lombo)|Tuna loin|B8303A||steak
Frango assado|Roast chicken|C9803A||drumstick
Linguiça|Sausage|9E3B2A||sausage
Salsicha|Hot dog sausage|D2704E||sausage
Bacon|Bacon|C5544E|F2D8C8|strip
Presunto|Ham|E59A9A||strip
Manteiga|Butter|F6DD8A||block
Maionese|Mayonnaise|F4EDCF||bowl
Mostarda|Mustard|D8A825||bowl
Ketchup|Ketchup|B1170F||bowl
Mel|Honey|E4A11B||jar
Azeite|Olive oil|B5A42A||bottle
Molho de soja|Soy sauce|3A1F15||bottle
Pipoca|Popcorn|F6E7B8||bowl
Batata frita|French fries|F2C14E||fries
Tortilha de milho|Corn tortilla|E8C77A||disc
Coxinha|Coxinha|D07A30||drop
Pão de queijo|Cheese bread ball|E7B865||orange
Tapioca|Tapioca crepe|F5F1E6||disc
Nori|Nori seaweed|1E2A1E||block
Tofu|Tofu|F1EDE0||block
Pizza de muçarela|Cheese pizza|F2C55A||pizza
Polenta frita|Fried polenta|E8B54A||block
Cuscuz de milho|Corn couscous|F2C94C||bowl
Omelete|Omelette|F2D36B||disc
Requeijão|Cream cheese|F6F0DF||bowl
Homus|Hummus|E0C79A||bowl
Pesto|Pesto|5A7A2A||bowl
Curry amarelo|Yellow curry|E8A82E||bowl
Sopa de ervilha|Pea soup|9AB04A||bowl
Sopa de abóbora|Pumpkin soup|EE8E2A||bowl
Beterraba ralada|Grated beet|8A1A3A||bowl
Granola|Granola|C8995A||bowl

#drink|Bebidas|Drinks|glass
Café preto|Black coffee|3B2416||mug
Café com leite|Coffee with milk|B98A5E||mug
Espuma de cappuccino|Cappuccino foam|D9B892||mug
Chá-verde|Green tea|B9B34A||teacup
Chá-preto|Black tea|8A3B12||teacup
Chá de hibisco|Hibiscus tea|8E1B2E||teacup
Chá de camomila|Chamomile tea|E6C25A||teacup
Chá-mate gelado|Iced mate tea|C08A3A||glass
Leite|Milk|F7F5EE||glass
Achocolatado|Chocolate milk|8A5A3C||glass
Chocolate quente|Hot chocolate|5A3220||mug
Matcha latte|Matcha latte|A6BD6A||mug
Suco de laranja|Orange juice|F7A11A||glass
Suco de uva|Grape juice|4E1A3A||glass
Suco de melancia|Watermelon juice|F05A6A||glass
Limonada|Lemonade|EEF0A8||glass
Suco verde|Green juice|7FAE3E||glass
Água de coco|Coconut water|EDEEE0||glass
Caldo de cana|Sugarcane juice|C9C26A||glass
Vitamina de morango|Strawberry smoothie|F29AA8||glass
Vitamina de banana|Banana smoothie|EED9A0||glass
Vitamina de abacate|Avocado smoothie|C6D49A||glass
Refrigerante de cola|Cola soda|3A1610||glass
Refrigerante de guaraná|Guaraná soda|B5651D||glass
Soda de limão|Lemon-lime soda|E8EFC0||glass
Suco de tomate|Tomato juice|C0281E||glass
Suco de maracujá|Passion fruit juice|F5C43A||glass
Suco de acerola|Acerola juice|E8442E||glass
Suco de cenoura|Carrot juice|F0802A||glass
Suco de beterraba|Beet juice|8A1238||glass
Suco de manga|Mango juice|FFB12E||glass
Suco de goiaba|Guava juice|F4867A||glass
Suco de abacaxi|Pineapple juice|F2DC6A||glass
Leite de amêndoas|Almond milk|EFE6D6||glass
Kombucha|Kombucha|C9913E||bottle
Xarope de groselha|Redcurrant syrup|B0123A||bottle
Iogurte de morango|Strawberry yogurt|F4B6C2||cup
Iogurte natural|Plain yogurt|F6F3EA||cup
Açaí na tigela|Açaí bowl|4A1E40||bowl
Milkshake de chocolate|Chocolate milkshake|7A4A32||glass
Milkshake de baunilha|Vanilla milkshake|F4E8C6||glass
Chá gelado de pêssego|Iced peach tea|E89A4A||glass
Bebida isotônica azul|Blue sports drink|3AA8E8||bottle

#dessert|Sobremesas|Desserts|cake
Brigadeiro|Chocolate truffle (brigadeiro)|4A2A1E||truffle
Beijinho|Coconut truffle|F4EEE2||truffle
Pudim de leite|Flan|E6A845||pudding
Calda de caramelo|Caramel sauce|A8561A||drop
Mousse de maracujá|Passion fruit mousse|F5D77A||cup
Mousse de chocolate|Chocolate mousse|6B3F2A||cup
Bolo de cenoura|Carrot cake|F09A3A|4E2A1A|cake
Bolo de chocolate|Chocolate cake|4E2A1A|6B3F2A|cake
Bolo red velvet|Red velvet cake|9E1B32||cake
Bolo de fubá|Cornmeal cake|E8BE5A|F2E6C2|cake
Cupcake de morango|Strawberry cupcake|F5A3B8||cupcake
Cupcake de baunilha|Vanilla cupcake|F4E6C4||cupcake
Cupcake de mirtilo|Blueberry cupcake|9A9ED8||cupcake
Sorvete de morango|Strawberry ice cream|F4A7B9||icecream
Sorvete de chocolate|Chocolate ice cream|6B4030||icecream
Sorvete de baunilha|Vanilla ice cream|F5E6B8||icecream
Sorvete de pistache|Pistachio ice cream|B8CC8A||icecream
Sorvete de menta|Mint ice cream|B8E6CF||icecream
Sorvete de flocos|Stracciatella ice cream|F4EFE2||icecream
Sorvete de manga|Mango sorbet|FFB840||icecream
Picolé de uva|Grape popsicle|6A2A6E||popsicle
Picolé de limão|Lime popsicle|C2E08A||popsicle
Picolé de morango|Strawberry popsicle|E8455A||popsicle
Gelatina de morango|Strawberry jelly|D8203A||jelly
Gelatina de limão|Lime jelly|7CC242||jelly
Gelatina de uva|Grape jelly|6A1E5A||jelly
Gelatina de abacaxi|Pineapple jelly|F2D23A||jelly
Rosquinha com glacê rosa|Pink-glazed donut|F28BB0||donut
Rosquinha de chocolate|Chocolate donut|5A3220||donut
Rosquinha com glacê branco|White-glazed donut|F6F2EA||donut
Macaron de framboesa|Raspberry macaron|E86A8E||macaron
Macaron de pistache|Pistachio macaron|B5CF8C||macaron
Macaron de lavanda|Lavender macaron|B9A2D6||macaron
Macaron de limão|Lemon macaron|F2E27A||macaron
Macaron de café|Coffee macaron|A8784E||macaron
Torta de limão|Lemon pie|F2E28A||pie
Torta de frutas vermelhas|Berry pie|8E1B3A||pie
Torta de abóbora|Pumpkin pie|D8862E||pie
Panqueca|Pancake|E0A55A||disc
Waffle|Waffle|D9973E||waffle
Doce de leite|Dulce de leche|B26B2A||jar
Goiabada|Guava paste|A3202E||block
Paçoca|Peanut candy|C9A06E||block
Quindim|Coconut custard (quindim)|F6C02A||pudding
Cocada branca|Coconut candy|F1E7D2||block
Cocada queimada|Toasted coconut candy|B5753A||block
Pé de moleque|Peanut brittle|9A5E2A||block
Merengue|Meringue|FBF8F2||drop
Churros|Churros|C27F3E||stick
Arroz-doce|Rice pudding|F4ECD4||bowl
Canjica|Hominy pudding|F2E8CC||bowl
Curau de milho|Corn custard|F2D46A||bowl
Mingau de aveia|Oatmeal porridge|E2D2AE||bowl
Chantili|Whipped cream|FBF7EE||cloud

#candy|Doces e balas|Candies|candy
Bala de morango|Strawberry candy|E2264B||candy
Bala de limão|Lime candy|9BD13A||candy
Bala de laranja|Orange candy|F5871F||candy
Bala de uva|Grape candy|7B2D8B||candy
Bala de menta|Mint candy|9EE0D0||candy
Bala de café|Coffee candy|5A3A22||candy
Bala de canela|Cinnamon candy|B8261E||candy
Bala de coco|Coconut taffy|F6F1E6||candy
Bala de caramelo|Toffee|B8742E||candy
Bala de tutti-frutti|Tutti-frutti candy|F27AA0||candy
Pirulito vermelho|Red lollipop|D71E3A||lollipop
Pirulito azul|Blue lollipop|2E7FD8||lollipop
Pirulito verde|Green lollipop|3AC24A||lollipop
Pirulito laranja|Orange lollipop|F28A1E||lollipop
Algodão-doce rosa|Pink cotton candy|F7B3D3||cloud
Algodão-doce azul|Blue cotton candy|9ED3F2||cloud
Chiclete rosa|Pink bubble gum|F48FB1||ball
Jujuba verde|Green gummy|5DBB3A||bean
Jujuba amarela|Yellow gummy|F7D52A||bean
Jujuba vermelha|Red gummy|D8202E||bean
Jujuba roxa|Purple gummy|7A2A9A||bean
Bala de goma azul|Blue gummy|3A6FD8||bean
Ursinho de goma laranja|Orange gummy bear|F28A1E||teddy
Ursinho de goma verde|Green gummy bear|6BBF3A||teddy
Ursinho de goma vermelho|Red gummy bear|D2202E||teddy
Ursinho de goma amarelo|Yellow gummy bear|F7D22A||teddy
Chocolate ao leite|Milk chocolate|7B4A2E||bar
Chocolate amargo|Dark chocolate|3E2418||bar
Chocolate branco|White chocolate|F2E8D2||bar
Chocolate rosa (rubi)|Ruby chocolate|D8828A||bar
Confeito rosa|Pink sprinkle|F49AC1||bean
Marshmallow|Marshmallow|FAF4F0||block
Marshmallow rosa|Pink marshmallow|F7C5D5||block
Alcaçuz preto|Black licorice|1E1A1A||stick
Alcaçuz vermelho|Red licorice|C2182B||stick
Pastilha de hortelã|Mint pastille|DDF2E8||ball
Drágea de chocolate amarela|Yellow candy-coated chocolate|F2C220||ball
Drágea de chocolate laranja|Orange candy-coated chocolate|F07A1E||ball
Drágea de chocolate marrom|Brown candy-coated chocolate|6B3A1E||ball
Drágea de chocolate azul|Blue candy-coated chocolate|1E7AD8||ball
Drágea de chocolate verde|Green candy-coated chocolate|2EA04A||ball
Bengala de açúcar (vermelho)|Candy cane red|D2142E||stick
Torrone|Nougat|F2E6CC||block
Fudge de chocolate|Chocolate fudge|5A3424||block
Bala de banana|Banana candy|E8B04A||block
Doce de abóbora|Pumpkin candy|E07A1E||bean

#spice|Temperos, grãos e farinhas|Spices, grains and flours|pile
Cúrcuma|Turmeric|E3A21A
Páprica|Paprika|C2361E
Pimenta-do-reino|Black pepper|3A3330
Canela em pó|Ground cinnamon|9A5A2E
Cominho|Cumin|9E7A44
Curry em pó|Curry powder|D9A02A
Orégano|Oregano|6B7A3A
Salsinha|Parsley|3E7E2E||leaf
Manjericão|Basil|3B7A33||leaf
Hortelã|Mint leaf|4E9A4A||leaf
Alecrim|Rosemary|5A7A55||spike
Sal grosso|Rock salt|F2F2F0
Açúcar mascavo|Brown sugar|A86B3A
Açúcar cristal|Granulated sugar|F7F4EC
Farinha de trigo|Wheat flour|F4EFE4
Farinha de mandioca|Cassava flour|EDE0B5
Fubá|Cornmeal|F2CC52
Aveia|Oats|D9C49A
Cacau em pó|Cocoa powder|5A3424
Café moído|Ground coffee|3B2618
Café em grão|Coffee beans|4A2A1A||bean
Gergelim|Sesame|E9DCB8
Gergelim preto|Black sesame|2A2626
Colorau (urucum)|Annatto|C8401E
Mostarda em grão|Mustard seed|C9A23E
Lentilha|Lentils|B07A3E
Lentilha vermelha|Red lentils|E07A3A
Grão-de-bico|Chickpeas|E2C08A
Arroz integral|Brown rice|B99A6A
Quinoa|Quinoa|E6D9B0
Feijão-vermelho|Kidney beans|7A1F22
Amendoim|Peanuts|C8925A
Castanha-do-pará|Brazil nut|8B5A3A||bean
Castanha-de-caju|Cashew nut|E8D2A6||bean
Pistache|Pistachio|9EB35A||bean
Amêndoa|Almond|B07A4E||bean
Noz-moscada|Nutmeg|8B5A3B||egg
Açafrão (estigmas)|Saffron|C8321E
Pimenta-rosa|Pink peppercorn|D2505A
Sumac|Sumac|8A2A2A
Erva-doce|Fennel seed|A8A86A
Chia|Chia seeds|5A5650
Linhaça dourada|Golden flaxseed|D2A85A

#kitchen|Cozinha e utensílios|Kitchenware|pot
Panela de cobre|Copper pot|B8673A||pot
Panela vermelha esmaltada|Red enamel pot|B71C1C||pot
Panela azul esmaltada|Blue enamel pot|2A4E8E||pot
Panela de barro|Clay pot|A0522D||pot
Frigideira de ferro|Cast-iron skillet|2E2B2A||pan
Frigideira verde de cerâmica|Green ceramic pan|5A8A6A||pan
Tábua de bambu|Bamboo cutting board|D9B87A||board
Tábua de plástico verde|Green plastic board|5AB86A||board
Bule esmaltado azul|Blue enamel teapot|2A5DA8||teapot
Bule amarelo|Yellow teapot|F2C230||teapot
Chaleira de inox|Stainless kettle|C8CCD0||teapot
Colher de pau|Wooden spoon|C79A5E||spoon
Espátula de silicone vermelha|Red silicone spatula|D2232A||spoon
Concha de silicone preta|Black ladle|2A2A2E||spoon
Tigela de cerâmica azul|Blue ceramic bowl|3A6EA5|3A6EA5|bowl
Prato branco|White plate|F4F4F2||plate
Prato de cerâmica verde-sálvia|Sage plate|9EB094||plate
Caneca amarela|Yellow mug|F2C230|F2C230|mug
Caneca vermelha|Red mug|C8202A|C8202A|mug
Copo de vidro verde|Green glass tumbler|6FA57A||glass
Garrafa térmica vermelha|Red thermos|C21F2A||bottle
Pote de vidro âmbar|Amber jar|A8641E||jar
Esponja amarela|Yellow sponge|F2D33A||block
Esponja verde (lado áspero)|Green scourer|2F8A3E||block
Avental vermelho|Red apron|C8202E||apron
Rolo de massa|Rolling pin|D9B07A||stick
Cesto de vime|Wicker basket|C49A5E||basket
Luva de forno laranja|Orange oven mitt|F2701E||glove
Pote de plástico rosa|Pink plastic tub|F28AB0||jar
Escorredor azul|Blue colander|2A7AC8||bowl
`;
