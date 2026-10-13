# Skill ContabilConnect — instalação e uso

Esta skill transforma um balancete bruto (aquele que sai do Domínio, Alterdata, Questor,
Sage) no arquivo `.json` que se sobe no ContabilConnect para publicar o demonstrativo do
cliente.

## O que você precisa

- **Claude Code** instalado e logado na sua máquina.
- **Python** (qualquer versão 3.x). Só é usado para ler planilhas; se você só trabalha com
  PDF, nem precisa. Para conferir, abra o terminal e digite `python --version`.
- Acesso ao painel do ContabilConnect.

## Instalar

Copie a pasta `contabilconnect` inteira para dentro de:

```
C:\Users\<seu-usuario>\.claude\skills\
```

O resultado deve ficar assim:

```
C:\Users\<seu-usuario>\.claude\skills\contabilconnect\SKILL.md
C:\Users\<seu-usuario>\.claude\skills\contabilconnect\referencia\schema.md
C:\Users\<seu-usuario>\.claude\skills\contabilconnect\scripts\extrair_planilha.py
```

Se a pasta `.claude\skills` não existir, crie. Feche e abra o Claude Code depois de copiar.

Para confirmar que instalou, digite `/contabilconnect` no Claude Code — a skill deve
aparecer na lista.

## Usar

1. Abra o Claude Code na pasta onde está o balancete (ou informe o caminho completo).
2. Peça, com o nome do arquivo:

   ```
   /contabilconnect gerar o demonstrativo do balancete-padaria-2024.xlsx
   ```

3. O Claude lê o arquivo, extrai os números e **salva um `.json`** na mesma pasta, com nome
   tipo `demonstrativo-padaria-do-ze-12-2024.json`. Ele informa o caminho no fim.
4. **Leia a tabela de conferência** que ele mostra — faturamento, CMV, lucro, total do ativo.
   É a sua checagem antes de subir. Se algo estiver estranho, diga a ele o que corrigir.

## Subir no painel

1. ContabilConnect → **Demonstrativos** → botão **Importar balancete**
2. Escolha o cliente e a competência
3. Selecione o arquivo `.json` gerado
4. Confira os números na tela do demonstrativo e ajuste o que precisar
5. **Publicar para o cliente** → **Copiar link** → mande o link ao cliente

O `.json` entra direto, sem passar por extração automática: os números que o Claude leu são
exatamente os que aparecem no relatório.

## Por que não subir o balancete direto

Dá — o painel aceita `.pdf`, `.xlsx` e `.docx` e extrai sozinho. Mas essa extração usa um
modelo mais fraco, e é justamente onde nascem os erros que estragam um relatório contábil:
confundir faturamento com CMV, pegar lucros acumulados como resultado do período, errar a
escala em R$ mil.

Para balancete que vai virar relatório assinado pelo escritório, use a skill.

## Se der problema

| Sintoma | O que fazer |
|---|---|
| `/contabilconnect` não aparece | A pasta está no lugar errado, ou o Claude Code não foi reiniciado |
| "python nao encontrado" | Instale o Python, ou salve o balancete em PDF e refaça o pedido |
| "nao e um .xlsx de verdade" | É um `.xls` antigo renomeado. Abra no Excel e salve como `.xlsx` |
| Números estranhos no relatório | Não publique. Corrija na tela do demonstrativo, e avise para a skill ser ajustada |
| Faturamento com valor absurdo | Provável erro de escala (R$ mil). Confira contra o balancete e corrija |

Dúvida ou erro recorrente: fale com o Welliton (adm.welliton@jscontadores.com.br).
