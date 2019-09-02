import Discord = require('discord.js');
import { AppDataSource } from "../appDataSource";
import { MoveSetUsage, UsageData, ChecksAndCountersUsageData, SmogonFormat } from "../smogon/models";
import { ColorHelper } from '../pokemon/helpers';
import { FormatHelper } from '../smogon/helpers';
import { Pokemon } from '../pokemon/models';
import { format } from 'util';

export interface Command {
  name: string;
  description: string;
  aliases: string[];
	execute(message, args);
}

type ArgData = { valid: boolean, pokemon: string, format: SmogonFormat };
type MovesetCommandData = { valid: boolean, pokemon: Pokemon, moveSet: MoveSetUsage, format: SmogonFormat };

export class CommandBase implements Command {
  name: string;
  description: string;
  dataSource: AppDataSource;
  aliases: string[] = [];
  
  constructor(dataSource: AppDataSource) {
    this.dataSource = dataSource;
  }
  
  execute(message: any, args: any) {
    throw new Error("Method not implemented.");
  }
  
  get usage() { return `${this.name} <pokémon name> [gen] | [tier]`; }

  get displayName(): string {
    return this.name
      ? this.name.charAt(0).toUpperCase() + this.name.slice(1)
      : '';
  }

  public tryGetMoveSetCommand(message, args: string[]): MovesetCommandData {
    if (!args.length) {
      let reply = `You didn't provide the Pokémon, ${message.author}!`;
      reply += `\nThe proper usage would be: \`/${this.usage}\``;
      reply += `\neg.:`;
      reply += `\n/${this.name} magearna`;
      reply += `\n/${this.name} alakazam gen6`;
      reply += `\n/${this.name} scizor uu`;
      reply += `\n/${this.name} machamp gen6 uu`;
      message.channel.send(reply);

      return { valid: false, pokemon: undefined, moveSet: undefined, format: undefined };
    }

    var argData = this.parseArgs(args);
    const moveset = this.dataSource.smogonStats.getMoveSet(argData.pokemon, argData.format);
    const pokemon = this.dataSource.pokemonDb.getPokemon(argData.pokemon);

    if (!moveset) {
      message.channel.send(`Could not find moveset for the provided Pokémon: '${argData.pokemon}' and format: ${FormatHelper.toReadableString(argData.format)}, ${message.author}!`);
      return { valid: false, pokemon: pokemon, moveSet: undefined, format: argData.format };
    }

    return { valid: true, pokemon: pokemon, moveSet: moveset, format: argData.format };
  }

  public processMoveSetCommand(message, 
                               args: string[], 
                               targetData: (data: MoveSetUsage) => UsageData[] | ChecksAndCountersUsageData[]) {
    const cmd = this.tryGetMoveSetCommand(message, args);
    if (!cmd.valid) return;
    
    const embed = new Discord.RichEmbed()
      .setColor(ColorHelper.getColorForType(cmd.pokemon.type1))
      .setThumbnail(`https://play.pokemonshowdown.com/sprites/bw/${cmd.pokemon.name.replace(/ /g, '').toLowerCase()}.png`)

    targetData(cmd.moveSet).forEach((data, i) => {
      const value = this.isCheckAndCounters(data)
        ? `Knocked out : ${data.kOed.toFixed(2)}%\nSwitched out: ${data.switchedOut.toFixed(2)}%`
        : `Usage: ${data.percentage.toFixed(2)}%`;

      embed.addField(`${data.name}`, value, true);
    });

    const msgHeader = `**__${cmd.moveSet.name} ${this.displayName}:__** ${FormatHelper.toReadableString(cmd.format)}`;
    message.channel.send(msgHeader, embed);
  }

  public processFilterBasedCommand(message, 
                                   args: string[], 
                                   targetData: (data: MoveSetUsage) => UsageData[]){
    const format = FormatHelper.getFormat(args);
    const movesets = this.dataSource.smogonStats.getMegasMoveSets(format);
    // .getMoveSets(
    //   undefined,
    //   (e) => e.items.some(i => e.name.endsWith("-Mega") && i.name.endsWith('ite'))
    // ).slice(0, 10);
    
    if (!movesets || movesets.length == 0) {
      return message.channel.send(`Could not find moveset for the provided data: '${FormatHelper.toReadableString(format)}', ${message.author}!`);
    }
    
    const pokemon = this.dataSource.pokemonDb.getPokemon(movesets[0].name);

    const embed = new Discord.RichEmbed()
      .setColor(ColorHelper.getColorForType(pokemon.type1))
      .setThumbnail(`https://play.pokemonshowdown.com/sprites/bw/${pokemon.name.replace(/ /g, '').toLowerCase()}.png`)

    movesets.forEach((set, i) => {
      embed.addField(`${set.name}`, `Usage: ${set.usage.toFixed(2)}%`, true);
    });

    const msgHeader = `**__${this.displayName}:__** Top 10 ${this.displayName} users of ${FormatHelper.toReadableString(format)}`;
    message.channel.send(msgHeader, embed);
  }

  private isCheckAndCounters(obj: any): obj is ChecksAndCountersUsageData {
    return obj.kOed !== undefined; 
  }

  private parseArgs(args: string[]): ArgData {
    if (args.length == 0)
      return { valid: false, pokemon: undefined, format: undefined };
    
    if (args.length == 1)
      return { valid: true, pokemon: args[0], format: FormatHelper.getDefault() };

    const hasPokemonSecondName = !FormatHelper.isValidGen(args[1]) && !FormatHelper.isValidTier(args[1]);
    
    const pokemonName = hasPokemonSecondName
      ? `${args[0]} ${args[1]}`
      : args[0]

    const format = FormatHelper.getFormat(args.slice(hasPokemonSecondName ? 2 : 1));

    return { valid: true, pokemon: pokemonName, format: format };
  }
}
