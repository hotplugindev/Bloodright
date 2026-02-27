const { PrismaClient } = require('@prisma/client');
const mapData = require('../src/data/map.json');
const culturesData = require('../src/data/cultures.json');
const religionsData = require('../src/data/religions.json');
const traitsData = require('../src/data/traits.json');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Check if seed data already exists
  const existingUser = await prisma.user.findFirst();
  if (existingUser) {
    console.log('Database already seeded, skipping.');
    return;
  }

  // ─── Create a default savegame for new-game template ───
  const systemUser = await prisma.user.create({
    data: {
      username: 'system',
      email: 'system@bloodright.local',
      passwordHash: 'SYSTEM_NO_LOGIN',
    },
  });

  const templateSave = await prisma.savegame.create({
    data: {
      name: 'New Game Template',
      userId: systemUser.id,
      gameDate: 0, // Day 0 = game start
    },
  });

  const saveId = templateSave.id;

  // ─── Seed Religions ───
  const religionMap = {};
  for (const rel of religionsData) {
    const religion = await prisma.religion.create({
      data: {
        savegameId: saveId,
        key: rel.key,
        name: rel.name,
        familyKey: rel.family,
        fervor: 50,
        doctrines: rel.doctrines,
        tenets: rel.tenets,
        hostility: rel.hostility || {},
      },
    });
    religionMap[rel.key] = religion;
  }

  // ─── Seed Cultures ───
  const cultureMap = {};
  for (const cul of culturesData) {
    const culture = await prisma.culture.create({
      data: {
        savegameId: saveId,
        key: cul.key,
        name: cul.name,
        groupKey: cul.group,
        ethos: cul.ethos,
        traditions: cul.traditions,
        innovations: cul.innovations || [],
        innovationProgress: {},
        bonuses: cul.bonuses || {},
      },
    });
    cultureMap[cul.key] = culture;
  }

  // Culture-religion assignments for title generation
  const cultureAssign = {
    e_valdria: { culture: 'valorian', religion: 'solarian' },
    e_khaldariya: { culture: 'khaldari', religion: 'iron_covenant' },
    e_sylvandor: { culture: 'sylvari', religion: 'old_ways' },
  };

  // ─── Seed Map Hierarchy ───
  let charId = 1;
  const dynastyNames = [
    'Ironhand', 'Goldheart', 'Stormborn', 'Ashwalker', 'Dawnbringer',
    'Nightshade', 'Silverfang', 'Blackthorn', 'Firemane', 'Frost',
    'Moonweaver', 'Sunspear', 'Deeproot', 'Steelcrown', 'Grimward',
    'Brightblade', 'Shadowvale', 'Oakheart', 'Ravensong', 'Thornwall',
    'Ironforge', 'Goldleaf', 'Starwatch', 'Duskveil', 'Flamekeep',
    'Stonehelm', 'Wolfbane', 'Eaglecrest', 'Lionmane', 'Bearhold',
    'Serpentcoil', 'Crowsfoot', 'Hawkridge', 'Falconcrest', 'Dragonsbane',
    'Boarshield',
  ];

  const firstNamesMale = [
    'Aldric', 'Beorn', 'Caden', 'Darius', 'Edric', 'Frej', 'Gareth',
    'Harald', 'Ivar', 'Jorund', 'Kael', 'Leoric', 'Magnus', 'Njord',
    'Osric', 'Perrin', 'Ragnar', 'Sigmund', 'Theron', 'Ulfric',
    'Varen', 'Willem', 'Xander', 'Yorick', 'Zarek', 'Alaric',
    'Baldric', 'Cedric', 'Dorian', 'Edmund', 'Florian', 'Gideon',
    'Hadrian', 'Ivan', 'Justinian',
  ];

  const firstNamesFemale = [
    'Astrid', 'Brenna', 'Cordelia', 'Dahlia', 'Elara', 'Freya',
    'Gwendolyn', 'Helga', 'Isolde', 'Jora', 'Katarina', 'Lyria',
    'Maelis', 'Nessa', 'Ophelia', 'Petra', 'Quintara', 'Rosalind',
    'Sigrid', 'Thea', 'Una', 'Vivienne', 'Willow', 'Xena',
    'Ysolde', 'Zelda', 'Aria', 'Britta', 'Calla', 'Diona',
  ];

  const personalityTraits = traitsData.filter((t) => t.category === 'personality').map((t) => t.key);
  const educationTraits = traitsData.filter((t) => t.category === 'education').map((t) => t.key);

  function randomFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomStat(base = 5) {
    return Math.max(1, Math.min(20, base + Math.floor(Math.random() * 11) - 5));
  }

  let dynastyIndex = 0;

  for (const empire of mapData.empires) {
    const assign = cultureAssign[empire.key];

    // Create empire title
    const empireTitle = await prisma.title.create({
      data: {
        savegameId: saveId,
        key: empire.key,
        name: empire.name,
        tier: 'empire',
        color: empire.color,
        successionLaw: 'primogeniture',
      },
    });

    for (const kingdom of empire.kingdoms) {
      const kingdomTitle = await prisma.title.create({
        data: {
          savegameId: saveId,
          key: kingdom.key,
          name: kingdom.name,
          tier: 'kingdom',
          color: kingdom.color,
          deJureParentId: empireTitle.id,
          successionLaw: 'partition',
        },
      });

      for (const duchy of kingdom.duchies) {
        const duchyTitle = await prisma.title.create({
          data: {
            savegameId: saveId,
            key: duchy.key,
            name: duchy.name,
            tier: 'duchy',
            color: duchy.color,
            deJureParentId: kingdomTitle.id,
            successionLaw: 'partition',
          },
        });

        // Create a dynasty for the duke
        const dName = dynastyNames[dynastyIndex % dynastyNames.length];
        dynastyIndex++;

        const dynasty = await prisma.dynasty.create({
          data: {
            savegameId: saveId,
            name: dName,
            motto: `Glory to House ${dName}`,
            renown: Math.floor(Math.random() * 500),
            perks: [],
          },
        });

        // Create the duke character
        const isMale = Math.random() > 0.3;
        const firstName = isMale
          ? randomFromArray(firstNamesMale)
          : randomFromArray(firstNamesFemale);

        const duke = await prisma.character.create({
          data: {
            savegameId: saveId,
            firstName: firstName,
            lastName: dName,
            isMale: isMale,
            birthDate: -(365 * (25 + Math.floor(Math.random() * 20))), // 25-45 years old at start
            isAlive: true,
            diplomacy: randomStat(8),
            martial: randomStat(8),
            stewardship: randomStat(8),
            intrigue: randomStat(6),
            learning: randomStat(6),
            prowess: randomStat(6),
            health: 4.0 + Math.random() * 2,
            fertility: 0.3 + Math.random() * 0.4,
            gold: 50 + Math.floor(Math.random() * 200),
            prestige: Math.floor(Math.random() * 300),
            piety: Math.floor(Math.random() * 100),
            dynastyId: dynasty.id,
            cultureId: cultureMap[assign.culture].id,
            religionId: religionMap[assign.religion].id,
          },
        });

        // Update dynasty head
        await prisma.dynasty.update({
          where: { id: dynasty.id },
          data: { headId: duke.id },
        });

        // Assign duchy to duke
        await prisma.title.update({
          where: { id: duchyTitle.id },
          data: { holderId: duke.id },
        });

        // Add some traits
        const pTrait = randomFromArray(personalityTraits);
        const eTrait = randomFromArray(educationTraits);
        await prisma.characterTrait.createMany({
          data: [
            { characterId: duke.id, traitKey: pTrait },
            { characterId: duke.id, traitKey: eTrait },
          ],
        });

        // Create counties under the duchy
        for (const county of duchy.counties) {
          const countyTitle = await prisma.title.create({
            data: {
              savegameId: saveId,
              key: county.key,
              name: county.name,
              tier: 'county',
              color: duchy.color,
              deJureParentId: duchyTitle.id,
              holderId: duke.id, // Duke holds first county, others can be assigned
              mapX: county.x,
              mapY: county.y,
              terrain: county.terrain,
              successionLaw: 'partition',
            },
          });

          // Create barony title
          const baronyTitle = await prisma.title.create({
            data: {
              savegameId: saveId,
              key: `b_${county.key.substring(2)}`,
              name: `Barony of ${county.name}`,
              tier: 'barony',
              color: duchy.color,
              deJureParentId: countyTitle.id,
              holderId: duke.id,
            },
          });

          // Create holding for the barony
          const holding = await prisma.holding.create({
            data: {
              savegameId: saveId,
              titleId: baronyTitle.id,
              type: 'castle',
              development: 1.0 + Math.random() * 3,
            },
          });

          // Add initial buildings
          await prisma.building.createMany({
            data: [
              { holdingId: holding.id, buildingKey: 'castle_walls', level: 1 },
              { holdingId: holding.id, buildingKey: 'farm_estate', level: 1 },
            ],
          });
        }
      }
    }
  }

  console.log('✅ Database seeded successfully!');
  console.log(`   - ${Object.keys(religionMap).length} religions`);
  console.log(`   - ${Object.keys(cultureMap).length} cultures`);
  console.log(`   - ${dynastyIndex} dynasties with rulers`);
  console.log(`   - Map hierarchy seeded with titles and holdings`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
