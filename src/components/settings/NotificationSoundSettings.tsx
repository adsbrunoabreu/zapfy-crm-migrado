import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Volume2, VolumeX, Play } from 'lucide-react';
import {
  useSoundPreferences,
  playNotificationPing,
  type SoundPlayWhen,
} from '@/hooks/useSoundPreferences';

export function NotificationSoundSettings() {
  const { prefs, update } = useSoundPreferences();
  const pct = Math.round(prefs.volume * 100);

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        {prefs.enabled ? (
          <Volume2 className="w-5 h-5 text-primary" />
        ) : (
          <VolumeX className="w-5 h-5 text-muted-foreground" />
        )}
        <h2 className="font-display text-lg font-semibold">Som de notificação</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label>Som de novas mensagens</Label>
            <p className="text-sm text-muted-foreground">
              Toca um sinal sonoro ao receber mensagens no WhatsApp
            </p>
          </div>
          <Switch
            checked={prefs.enabled}
            onCheckedChange={(c) => update({ enabled: c })}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className={!prefs.enabled ? 'text-muted-foreground' : ''}>
              Volume
            </Label>
            <span className="text-sm text-muted-foreground tabular-nums">
              {pct}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[pct]}
              min={0}
              max={100}
              step={5}
              disabled={!prefs.enabled}
              onValueChange={([v]) => update({ volume: v / 100 })}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!prefs.enabled}
              onClick={() => playNotificationPing(prefs.volume)}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Testar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A preferência é salva neste dispositivo.
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-border space-y-3">
        <Label className={!prefs.enabled ? 'text-muted-foreground' : ''}>
          Quando tocar o som
        </Label>
        <RadioGroup
          value={prefs.playWhen}
          onValueChange={(v) => update({ playWhen: v as SoundPlayWhen })}
          disabled={!prefs.enabled}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <label
            htmlFor="play-when-always"
            className={`flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40 ${
              !prefs.enabled ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <RadioGroupItem value="always" id="play-when-always" className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Sempre que receber uma mensagem</div>
              <p className="text-xs text-muted-foreground">
                Toca o som para qualquer mensagem nova, mesmo com o chat aberto.
              </p>
            </div>
          </label>

          <label
            htmlFor="play-when-unfocused"
            className={`flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/40 ${
              !prefs.enabled ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            <RadioGroupItem value="unfocused" id="play-when-unfocused" className="mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Apenas quando o chat estiver fora do foco</div>
              <p className="text-xs text-muted-foreground">
                Não toca se a conversa já estiver aberta na tela e a aba ativa.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>
    </Card>
  );
}
