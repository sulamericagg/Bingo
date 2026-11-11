/** CAÇA BLOOP — textos de dados (todas as chaves estáticas para o extrator de i18n). */
import { t } from '../i18n';
import type { Element, Material, Pattern, Rarity, Shape } from './genome';
import type { Weather } from './spawns';

export const elName = (e: Element): string =>
  ({
    fogo: t('caca.el.fogo', 'Fogo'),
    agua: t('caca.el.agua', 'Água'),
    planta: t('caca.el.planta', 'Planta'),
    eletrico: t('caca.el.eletrico', 'Elétrico'),
    gelo: t('caca.el.gelo', 'Gelo'),
    terra: t('caca.el.terra', 'Terra'),
    ar: t('caca.el.ar', 'Ar'),
    luz: t('caca.el.luz', 'Luz'),
    sombra: t('caca.el.sombra', 'Sombra'),
    som: t('caca.el.som', 'Som'),
  })[e];

export const rarName = (r: Rarity): string =>
  [
    t('caca.rar.0', 'Comum'),
    t('caca.rar.1', 'Incomum'),
    t('caca.rar.2', 'Raro'),
    t('caca.rar.3', 'Épico'),
    t('caca.rar.4', 'Lendário'),
    t('caca.rar.5', 'ÚNICO'),
  ][r];

export const shapeName = (s: Shape): string =>
  ({
    redondo: t('caca.shape.redondo', 'Redondo'),
    alto: t('caca.shape.alto', 'Alto'),
    gordo: t('caca.shape.gordo', 'Gordinho'),
    magro: t('caca.shape.magro', 'Magrinho'),
    longo: t('caca.shape.longo', 'Comprido'),
    blob: t('caca.shape.blob', 'Geleca'),
    estrela: t('caca.shape.estrela', 'Estrela'),
    cubo: t('caca.shape.cubo', 'Cubinho'),
    gota: t('caca.shape.gota', 'Gota'),
    pera: t('caca.shape.pera', 'Pera'),
  })[s];

export const matName = (m: Material): string =>
  ({
    liso: t('caca.mat.liso', 'Liso'),
    fofo: t('caca.mat.fofo', 'Fofo'),
    cristal: t('caca.mat.cristal', 'Cristal'),
    metal: t('caca.mat.metal', 'Metal'),
    gelatina: t('caca.mat.gelatina', 'Gelatina'),
    nuvem: t('caca.mat.nuvem', 'Nuvem'),
    lava: t('caca.mat.lava', 'Lava'),
    prisma: t('caca.mat.prisma', 'Prisma'),
  })[m];

export const patName = (p: Pattern): string =>
  ({
    nenhum: t('caca.pat.nenhum', 'Sem padrão'),
    barriga: t('caca.pat.barriga', 'Barriguinha'),
    pintas: t('caca.pat.pintas', 'Pintas'),
    listras: t('caca.pat.listras', 'Listras'),
    degrade: t('caca.pat.degrade', 'Degradê'),
    galaxia: t('caca.pat.galaxia', 'Galáxia'),
    xadrez: t('caca.pat.xadrez', 'Xadrez'),
    brilhos: t('caca.pat.brilhos', 'Brilhos'),
    manchas: t('caca.pat.manchas', 'Manchas'),
    aneis: t('caca.pat.aneis', 'Anéis'),
  })[p];

export const weatherName = (w: Weather): string =>
  ({
    sol: t('caca.wx.sol', 'Sol'),
    chuva: t('caca.wx.chuva', 'Chuva'),
    vento: t('caca.wx.vento', 'Vento'),
    nublado: t('caca.wx.nublado', 'Nublado'),
    neblina: t('caca.wx.neblina', 'Neblina'),
  })[w];
